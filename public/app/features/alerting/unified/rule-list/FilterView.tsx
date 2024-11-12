import { compact, isEqual } from 'lodash';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import Skeleton from 'react-loading-skeleton';

import { Button, Card, Stack } from '@grafana/ui';
import { Matcher } from 'app/plugins/datasource/alertmanager/types';
import { DataSourceRuleGroupIdentifier } from 'app/types/unified-alerting';
import { PromRuleDTO, PromRuleGroupDTO } from 'app/types/unified-alerting-dto';

import { prometheusApi } from '../api/prometheusApi';
import { isLoading, useAsync } from '../hooks/useAsync';
import { RulesFilter } from '../search/rulesSearchParser';
import { labelsMatchMatchers } from '../utils/alertmanager';
import { getDatasourceAPIUid } from '../utils/datasource';
import { parseMatcher } from '../utils/matchers';
import { hashRule } from '../utils/rule-id';
import { isAlertingRule } from '../utils/rules';

import { AlertRuleLoader } from './RuleList.v2';
import { ListItem } from './components/ListItem';
import { ActionsLoader } from './components/RuleActionsButtons.V2';
import { RuleListIcon } from './components/RuleListIcon';

interface FilterViewProps {
  filterState: RulesFilter;
}

export function FilterView({ filterState }: FilterViewProps) {
  const [prevFilterState, setPrevFilterState] = useState(filterState);
  const filterChanged = !isEqual(prevFilterState, filterState);
  const [transitionPending, startTransition] = useTransition();

  const { getFilteredRulesIterator } = useFilteredRulesIteratorProvider();
  const rulesIterator = useRef(getFilteredRulesIterator(filterState));

  const [rules, setRules] = useState<RuleWithOrigin[]>([]);
  const [noMoreResults, setNoMoreResults] = useState(false);

  const [{ execute: loadNextPage }, state] = useAsync(async () => {
    const pageSize = 50;
    let fetchedRulesCount = 0;

    while (fetchedRulesCount < pageSize) {
      const { value, done } = await rulesIterator.current.next();
      if (done) {
        setNoMoreResults(true);
        break;
      }

      // ⚠️ use transitions here so `setRules` doesn't cascade into a _ton_ of re-renders and blocks the entire main thread
      // this startTransition will ensure the state updates are all batched.
      startTransition(() => {
        setRules((rules) => rules.concat(value));
      });

      fetchedRulesCount++;
    }
  });

  if (filterChanged) {
    rulesIterator.current = getFilteredRulesIterator(filterState);
    setRules([]);
    setNoMoreResults(false);
    setPrevFilterState(filterState);
    loadNextPage();
  }

  useEffect(() => {
    loadNextPage();
  }, [loadNextPage]);

  const loading = isLoading(state) || transitionPending;

  return (
    <Stack direction="column" gap={0}>
      {rules.map(({ ruleKey, rule, groupIdentifier }) => (
        <AlertRuleLoader key={ruleKey} rule={rule} groupIdentifier={groupIdentifier} />
      ))}
      {loading ? (
        <>
          <AlertRuleListItemLoader />
          <AlertRuleListItemLoader />
          <AlertRuleListItemLoader />
        </>
      ) : noMoreResults ? (
        <Card>No more results</Card>
      ) : (
        <Button onClick={loadNextPage}>Load more...</Button>
      )}
    </Stack>
  );
}

const AlertRuleListItemLoader = () => (
  <ListItem
    title={<Skeleton width={64} />}
    icon={<RuleListIcon isPaused={false} />}
    description={<Skeleton width={256} />}
    actions={<ActionsLoader />}
  />
);

const { useLazyGroupsQuery } = prometheusApi;

interface RuleWithOrigin {
  /**
   * Artificial frontend-only identifier for the rule.
   * It's used as a key for the rule in the rule list to prevent key duplication
   */
  ruleKey: string;
  rule: PromRuleDTO;
  groupIdentifier: DataSourceRuleGroupIdentifier;
}

interface GroupWithIdentifier extends PromRuleGroupDTO {
  identifier: DataSourceRuleGroupIdentifier;
}

function useFilteredRulesIteratorProvider() {
  const [fetchGroups] = useLazyGroupsQuery();

  const getGroups = useCallback(
    async function* (ruleSourceName: string, maxGroups: number) {
      const ruleSourceUid = getDatasourceAPIUid(ruleSourceName);

      const response = await fetchGroups({
        ruleSource: { uid: ruleSourceUid },
        maxGroups,
      });

      if (response.data?.data) {
        yield* response.data.data.groups.map((group) => mapGroupToGroupWithIdentifier(group, ruleSourceName));
      }

      let lastToken: string | undefined = undefined;
      if (response.data?.data?.nextToken) {
        lastToken = response.data.data.nextToken;
      }

      while (lastToken) {
        const response = await fetchGroups({
          ruleSource: { uid: ruleSourceUid },
          nextToken: lastToken,
          maxGroups,
        });

        if (response.data?.data) {
          yield* response.data.data.groups.map((group) => mapGroupToGroupWithIdentifier(group, ruleSourceName));
        }

        lastToken = response.data?.data?.nextToken;
      }
    },
    [fetchGroups]
  );

  const getGroupsFromAllDataSources = useCallback(
    async function* (rulesSourceNames: string[], maxGroups: number) {
      const dsGenerators = rulesSourceNames.map((ds) => [ds, getGroups(ds, maxGroups)] as const);

      const dsActiveRequests = new Map(
        dsGenerators.map(([ds, gen]) => [ds, gen.next().then((iterator) => ({ datasource: ds, iterator }))] as const)
      );

      while (dsActiveRequests.size > 0) {
        const { datasource, iterator } = await Promise.race(dsActiveRequests.values());
        if (iterator.done) {
          dsActiveRequests.delete(datasource);
        } else {
          yield iterator.value;
          const currentGenerator = dsGenerators.find(([ds]) => ds === datasource);
          if (currentGenerator) {
            dsActiveRequests.set(
              datasource,
              currentGenerator[1].next().then((iterator) => ({ datasource, iterator }))
            );
          }
        }
      }
    },
    [getGroups]
  );

  const getFilteredRules = useCallback(async function* (
    groupsIterator: AsyncGenerator<GroupWithIdentifier, void, undefined>,
    filter: RulesFilter
  ): AsyncGenerator<RuleWithOrigin, void, undefined> {
    for await (const group of groupsIterator) {
      const filteredGroup = getFilteredGroup(group, filter);
      if (filteredGroup) {
        const filteredRules = mapGroupToRules(filteredGroup);
        yield* filteredRules;
      }
    }
  }, []);

  const getFilteredRulesIterator = (filter: RulesFilter) => {
    const groupsIterator = getGroupsFromAllDataSources(filter.dataSourceNames, 2000);
    const rulesIterator = getFilteredRules(groupsIterator, filter);

    return rulesIterator;
  };

  return { getFilteredRulesIterator };
}

function mapGroupToRules(group: GroupWithIdentifier): RuleWithOrigin[] {
  const groupKey = `${group.identifier.namespace.name}${group.identifier.groupName}`;
  return group.rules.map<RuleWithOrigin>((rule) => ({
    ruleKey: `${group.identifier.rulesSource.name}-${groupKey}-${hashRule(rule)}`,
    rule,
    groupIdentifier: group.identifier,
  }));
}

function mapGroupToGroupWithIdentifier(group: PromRuleGroupDTO, ruleSourceName: string): GroupWithIdentifier {
  return {
    ...group,
    identifier: {
      rulesSource: { name: ruleSourceName, uid: getDatasourceAPIUid(ruleSourceName) },
      namespace: { name: group.file },
      groupName: group.name,
      groupOrigin: 'datasource',
    },
  };
}

/**
 * Returns a new group with only the rules that match the filter.
 * @returns A new group with filtered rules, or undefined if the group does not match the filter or all rules are filtered out.
 */
function getFilteredGroup<T extends PromRuleGroupDTO>(group: T, filterState: RulesFilter): T | undefined {
  const { name, rules, file } = group;

  // TODO Add fuzzy filtering or not
  if (filterState.namespace && !file.includes(filterState.namespace)) {
    return undefined;
  }

  if (filterState.groupName && !name.includes(filterState.groupName)) {
    return undefined;
  }

  const matchingRules = rules.filter((rule) => ruleMatchesFilter(rule, filterState));
  if (matchingRules.length === 0) {
    return undefined;
  }

  return { ...group, rules: matchingRules };
}

function ruleMatchesFilter(rule: PromRuleDTO, filterState: RulesFilter) {
  const { name, labels = {}, health, type } = rule;

  if (filterState.freeFormWords.length > 0 && !filterState.freeFormWords.some((word) => name.includes(word))) {
    return false;
  }
  if (filterState.ruleName && !name.includes(filterState.ruleName)) {
    return false;
  }
  if (filterState.labels.length > 0) {
    const matchers = compact(filterState.labels.map(looseParseMatcher));
    const doRuleLabelsMatchQuery = matchers.length > 0 && labelsMatchMatchers(labels, matchers);
    if (!doRuleLabelsMatchQuery) {
      return false;
    }
  }
  if (filterState.ruleType && type !== filterState.ruleType) {
    return false;
  }
  if (filterState.ruleState) {
    if (!isAlertingRule(rule)) {
      return false;
    }
    if (rule.state !== filterState.ruleState) {
      return false;
    }
  }
  if (filterState.ruleHealth && health !== filterState.ruleHealth) {
    return false;
  }

  return true;
}

function looseParseMatcher(matcherQuery: string): Matcher | undefined {
  try {
    return parseMatcher(matcherQuery);
  } catch {
    // Try to createa a matcher than matches all values for a given key
    return { name: matcherQuery, value: '', isRegex: true, isEqual: true };
  }
}
