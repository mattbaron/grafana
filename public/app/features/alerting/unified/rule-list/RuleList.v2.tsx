import { css } from '@emotion/css';
import { memo, PropsWithChildren, ReactNode, useMemo } from 'react';
import Skeleton from 'react-loading-skeleton';

import { GrafanaTheme2 } from '@grafana/data';
import {
  Button,
  Dropdown,
  Icon,
  IconButton,
  LinkButton,
  Menu,
  Stack,
  Text,
  useStyles2,
  withErrorBoundary,
} from '@grafana/ui';
import { Trans } from 'app/core/internationalization';
import {
  DataSourceNamespaceIdentifier,
  DataSourceRuleGroupIdentifier,
  Rule,
  RuleGroup,
  RuleIdentifier,
} from 'app/types/unified-alerting';
import { RulesSourceApplication } from 'app/types/unified-alerting-dto';

import { alertRuleApi } from '../api/alertRuleApi';
import { featureDiscoveryApi } from '../api/featureDiscoveryApi';
import { AlertingPageWrapper } from '../components/AlertingPageWrapper';
import { Spacer } from '../components/Spacer';
import { WithReturnButton } from '../components/WithReturnButton';
import RulesFilter from '../components/rules/Filter/RulesFilter';
import { useRulesFilter } from '../hooks/useFilteredRules';
import { useURLSearchParams } from '../hooks/useURLSearchParams';
import { getAllRulesSources, getDatasourceAPIUid, isGrafanaRulesSource } from '../utils/datasource';
import { equal, fromRule, fromRulerRule, hashRule, stringifyIdentifier } from '../utils/rule-id';
import { getRulePluginOrigin, isAlertingRule, isRecordingRule } from '../utils/rules';
import { createRelativeUrl } from '../utils/url';

import { FilterView } from './FilterView';
import { StateView } from './StateView';
import { AlertRuleListItem, RecordingRuleListItem, UnknownRuleListItem } from './components/AlertRuleListItem';
import { ListGroup } from './components/ListGroup';
import { ListSection } from './components/ListSection';
import { DataSourceIcon } from './components/Namespace';
import { ActionsLoader, RuleActionsButtons } from './components/RuleActionsButtons.V2';
import { LoadingIndicator } from './components/RuleGroup';
import { usePaginatedPrometheusRuleNamespaces } from './hooks/usePaginatedPrometheusRuleNamespaces';

const { useGetRuleGroupForNamespaceQuery } = alertRuleApi;

const GROUP_PAGE_SIZE = 10;

const RuleList = withErrorBoundary(
  () => {
    const [queryParams] = useURLSearchParams();
    const ruleSources = getAllRulesSources();

    const view = queryParams.get('view') ?? 'groups';

    const { filterState, hasActiveFilters } = useRulesFilter();

    return (
      // We don't want to show the Loading... indicator for the whole page.
      // We show separate indicators for Grafana-managed and Cloud rules
      <AlertingPageWrapper navId="alert-list" isLoading={false} actions={null}>
        <RulesFilter onClear={() => {}} />
        <Stack direction="column" gap={1}>
          {view === 'state' ? (
            <StateView namespaces={[]} />
          ) : hasActiveFilters ? (
            <FilterView filterState={filterState} />
          ) : (
            <>
              {ruleSources.map((ruleSource) => {
                if (isGrafanaRulesSource(ruleSource)) {
                  return <GrafanaDataSourceLoader key={ruleSource} />;
                } else {
                  return <DataSourceLoader key={ruleSource.uid} uid={ruleSource.uid} name={ruleSource.name} />;
                }
              })}
            </>
          )}
        </Stack>
      </AlertingPageWrapper>
    );
  },
  { style: 'page' }
);

const { useDiscoverDsFeaturesQuery } = featureDiscoveryApi;

interface DataSourceLoaderProps {
  name: string;
  uid: string;
}

const GrafanaDataSourceLoader = () => {
  return <DataSourceSection name="Grafana" application="grafana" isLoading={true}></DataSourceSection>;
};

const DataSourceLoader = ({ uid, name }: DataSourceLoaderProps) => {
  const { data: dataSourceInfo, isLoading } = useDiscoverDsFeaturesQuery({ uid });

  if (isLoading) {
    return <DataSourceSection loader={<Skeleton width={250} height={16} />} />;
  }

  // 2. grab prometheus rule groups with max_groups if supported
  if (dataSourceInfo) {
    return (
      <PaginatedDataSourceLoader
        ruleSourceName={dataSourceInfo.name}
        uid={uid}
        name={name}
        application={dataSourceInfo.application}
      />
    );
  }

  return null;
};

// TODO Try to use a better rules source identifier
interface PaginatedDataSourceLoaderProps extends Pick<DataSourceSectionProps, 'application' | 'uid' | 'name'> {
  ruleSourceName: string;
}

function PaginatedDataSourceLoader({ ruleSourceName, name, uid, application }: PaginatedDataSourceLoaderProps) {
  const {
    page: ruleNamespaces,
    nextPage,
    previousPage,
    canMoveForward,
    canMoveBackward,
    isLoading,
  } = usePaginatedPrometheusRuleNamespaces(ruleSourceName, GROUP_PAGE_SIZE);

  return (
    <DataSourceSection name={name} application={application} uid={uid} isLoading={isLoading}>
      <Stack direction="column" gap={1}>
        {ruleNamespaces.map((namespace) => (
          <ListSection
            key={namespace.name}
            title={
              <Stack direction="row" gap={1} alignItems="center">
                <Icon name="folder" /> {namespace.name}
              </Stack>
            }
          >
            {namespace.groups.map((group) => (
              <RuleGroupListItem
                key={`${ruleSourceName}-${namespace.name}-${group.name}`}
                group={group}
                ruleSourceName={ruleSourceName}
                namespaceId={namespace}
              />
            ))}
          </ListSection>
        ))}
        {!isLoading && (
          <LazyPagination
            nextPage={nextPage}
            previousPage={previousPage}
            canMoveForward={canMoveForward}
            canMoveBackward={canMoveBackward}
          />
        )}
      </Stack>
    </DataSourceSection>
  );
}

interface RuleGroupListItemProps {
  group: RuleGroup;
  ruleSourceName: string;
  namespaceId: DataSourceNamespaceIdentifier;
}

function RuleGroupListItem({ group, ruleSourceName, namespaceId }: RuleGroupListItemProps) {
  return (
    <ListGroup
      key={group.name}
      name={group.name}
      isOpen={false}
      actions={
        <>
          <Dropdown
            overlay={
              <Menu>
                <Menu.Item label="Edit" icon="pen" data-testid="edit-group-action" />
                <Menu.Item label="Re-order rules" icon="flip" />
                <Menu.Divider />
                <Menu.Item label="Export" icon="download-alt" />
                <Menu.Item label="Delete" icon="trash-alt" destructive />
              </Menu>
            }
          >
            <IconButton name="ellipsis-h" aria-label="rule group actions" />
          </Dropdown>
        </>
      }
    >
      {group.rules.map((rule) => {
        const groupIdentifier: DataSourceRuleGroupIdentifier = {
          rulesSource: { uid: getDatasourceAPIUid(ruleSourceName), name: ruleSourceName },
          namespace: namespaceId,
          groupName: group.name,
          groupOrigin: 'datasource',
        };

        return <AlertRuleLoader key={hashRule(rule)} rule={rule} groupIdentifier={groupIdentifier} />;
      })}
    </ListGroup>
  );
}

interface LazyPaginationProps {
  canMoveForward: boolean;
  canMoveBackward: boolean;
  nextPage: () => void;
  previousPage: () => void;
}

function LazyPagination({ canMoveForward, canMoveBackward, nextPage, previousPage }: LazyPaginationProps) {
  return (
    <Stack direction="row" gap={1}>
      <Button
        aria-label={`previous page`}
        size="sm"
        variant="secondary"
        onClick={previousPage}
        disabled={!canMoveBackward}
      >
        <Icon name="angle-left" />
      </Button>
      <Button aria-label={`next page`} size="sm" variant="secondary" onClick={nextPage} disabled={!canMoveForward}>
        <Icon name="angle-right" />
      </Button>
    </Stack>
  );
}

interface AlertRuleLoaderProps {
  rule: Rule;
  groupIdentifier: DataSourceRuleGroupIdentifier;
}

export const AlertRuleLoader = memo(function AlertRuleLoader({ rule, groupIdentifier }: AlertRuleLoaderProps) {
  const { rulesSource, namespace, groupName } = groupIdentifier;

  const ruleIdentifier = fromRule(rulesSource.name, namespace.name, groupName, rule);
  const href = createViewLinkFromIdentifier(ruleIdentifier);
  const originMeta = getRulePluginOrigin(rule);

  // @TODO work with context API to propagate rulerConfig and such
  const { data: dataSourceInfo } = useDiscoverDsFeaturesQuery({ uid: rulesSource.uid });

  // @TODO refactor this to use a separate hook (useRuleWithLocation() and useCombinedRule() seems to introduce infinite loading / recursion)
  const {
    isLoading,
    data: rulerRuleGroup,
    // error,
  } = useGetRuleGroupForNamespaceQuery(
    {
      namespace: namespace.name,
      group: groupName,
      rulerConfig: dataSourceInfo?.rulerConfig!,
    },
    { skip: !dataSourceInfo?.rulerConfig }
  );

  const rulerRule = useMemo(() => {
    if (!rulerRuleGroup) {
      return;
    }

    return rulerRuleGroup.rules.find((rule) =>
      equal(fromRulerRule(rulesSource.name, namespace.name, groupName, rule), ruleIdentifier)
    );
  }, [rulesSource, namespace, groupName, ruleIdentifier, rulerRuleGroup]);

  // 1. get the rule from the ruler API with "ruleWithLocation"
  // 1.1 skip this if this datasource does not have a ruler
  //
  // 2.1 render action buttons
  // 2.2 render provisioning badge and contact point metadata, etc.

  const actions = useMemo(() => {
    if (isLoading) {
      return <ActionsLoader />;
    }

    if (rulerRule) {
      return <RuleActionsButtons rule={rulerRule} promRule={rule} groupIdentifier={groupIdentifier} compact />;
    }

    return null;
  }, [groupIdentifier, isLoading, rule, rulerRule]);

  if (isAlertingRule(rule)) {
    return (
      <AlertRuleListItem
        name={rule.name}
        rulesSource={rulesSource}
        application={dataSourceInfo?.application}
        group={groupName}
        namespace={namespace.name}
        href={href}
        summary={rule.annotations?.summary}
        state={rule.state}
        health={rule.health}
        error={rule.lastError}
        labels={rule.labels}
        isProvisioned={undefined}
        instancesCount={rule.alerts?.length}
        actions={actions}
        origin={originMeta}
      />
    );
  }

  if (isRecordingRule(rule)) {
    return (
      <RecordingRuleListItem
        name={rule.name}
        rulesSource={rulesSource}
        application={dataSourceInfo?.application}
        group={groupName}
        namespace={namespace.name}
        href={href}
        health={rule.health}
        error={rule.lastError}
        labels={rule.labels}
        isProvisioned={undefined}
        actions={actions}
        origin={originMeta}
      />
    );
  }

  return <UnknownRuleListItem rule={rule} groupIdentifier={groupIdentifier} />;
});

function createViewLinkFromIdentifier(identifier: RuleIdentifier, returnTo?: string) {
  const paramId = encodeURIComponent(stringifyIdentifier(identifier));
  const paramSource = encodeURIComponent(identifier.ruleSourceName);

  return createRelativeUrl(`/alerting/${paramSource}/${paramId}/view`, returnTo ? { returnTo } : {});
}

interface DataSourceSectionProps extends PropsWithChildren {
  uid?: string;
  name?: string;
  loader?: ReactNode;
  application?: RulesSourceApplication;
  isLoading?: boolean;
  description?: ReactNode;
}

const DataSourceSection = ({
  uid,
  name,
  application,
  children,
  loader,
  isLoading = false,
  description = null,
}: DataSourceSectionProps) => {
  const styles = useStyles2(getStyles);

  return (
    <Stack direction="column" gap={1}>
      <Stack direction="column" gap={0}>
        {isLoading && <LoadingIndicator />}
        <div className={styles.dataSourceSectionTitle}>
          {loader ?? (
            <Stack alignItems="center">
              {application && <DataSourceIcon application={application} />}
              {name && (
                <Text variant="body" weight="bold">
                  {name}
                </Text>
              )}
              {description && (
                <>
                  {'·'}
                  {description}
                </>
              )}
              <Spacer />
              {uid && (
                <WithReturnButton
                  title="alert rules"
                  component={
                    <LinkButton variant="secondary" size="sm" href={`/connections/datasources/edit/${uid}`}>
                      <Trans i18nKey="alerting.rule-list.configure-datasource">Configure</Trans>
                    </LinkButton>
                  }
                />
              )}
            </Stack>
          )}
        </div>
      </Stack>
      <div className={styles.itemsWrapper}>{children}</div>
    </Stack>
  );
};

const getStyles = (theme: GrafanaTheme2) => ({
  itemsWrapper: css({
    position: 'relative',
    marginLeft: theme.spacing(1.5),

    '&:before': {
      content: "''",
      position: 'absolute',
      height: '100%',

      marginLeft: `-${theme.spacing(1.5)}`,
      borderLeft: `solid 1px ${theme.colors.border.weak}`,
    },
  }),
  dataSourceSectionTitle: css({
    background: theme.colors.background.secondary,
    padding: `${theme.spacing(1)} ${theme.spacing(1.5)}`,

    border: `solid 1px ${theme.colors.border.weak}`,
    borderRadius: theme.shape.radius.default,
  }),
});

export default RuleList;
