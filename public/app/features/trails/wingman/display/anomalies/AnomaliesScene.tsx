import { css } from '@emotion/css';
import { parser } from '@prometheus-io/lezer-promql';

import { getBackendSrv } from '@grafana/runtime';
import {
  SceneObjectBase,
  SceneComponentProps,
  SceneObjectState,
  SceneCSSGridLayout,
  SceneCSSGridItem,
} from '@grafana/scenes';
import type { Dashboard, DataSourceRef } from '@grafana/schema';
import { useStyles2 } from '@grafana/ui';
import { Trans } from 'app/core/internationalization';

import { getPreviewPanelFor } from '../../../MetricSelect/previewPanel';
import { ROW_PREVIEW_HEIGHT } from '../../MetricSelectSceneForWingman';

import { SceneChangepointDetector } from './SceneChangepointDetector';
import { SortByScene, SortCriteriaChanged } from './SortByChangepointsScene';
import { hideEmptyPanels } from './hideEmptyPanels';

const groupByOptions = {
  none: 'None',
  dashboard: 'Dashboard',
};

type SortBy = 'anomalies' | 'alphabetical' | 'alphabetical-reversed';

/**
 * Extracts all metric names from a PromQL expression
 * @param {string} promqlExpression - The PromQL expression to parse
 * @returns {string[]} An array of unique metric names found in the expression
 */
function extractMetricNames(promqlExpression: string): string[] {
  const tree = parser.parse(promqlExpression);
  const metricNames = new Set<string>();
  const cursor = tree.cursor();

  do {
    // when we find a VectorSelector...
    if (cursor.type.is('VectorSelector')) {
      // go to its first child
      if (cursor.firstChild()) {
        do {
          // look for the Identifier node
          if (cursor.type.is('Identifier')) {
            const metricName = promqlExpression.slice(cursor.from, cursor.to);
            metricNames.add(metricName);
          }
        } while (cursor.nextSibling());
        cursor.parent();
      }
    }
  } while (cursor.next());

  return Array.from(metricNames);
}

interface AnomaliesSceneState extends SceneObjectState {
  dashboardPanelMetrics: DashboardPanelMetrics;
  body: SceneCSSGridLayout;
  loading: 'idle' | 'pending' | 'fulfilled' | 'rejected';
  groupBy: keyof typeof groupByOptions;
  sortBy: SortByScene;
}

interface MetricWithMeta {
  metric: string;
  datasource: { uid: string };
  dashboard: { uid: string; title: string };
}

interface DashboardPanelMetrics {
  byDashboard: { [key: string]: MetricWithMeta[] };
  byDatasource: { [key: string]: MetricWithMeta[] };
  uniqueMetrics: MetricWithMeta[];
}

interface MetricState {
  changepointCount: number;
  isComplexMetric: boolean;
}

export class AnomaliesScene extends SceneObjectBase<AnomaliesSceneState> {
  // Cache panel instances by metric+datasource key to avoid recreation during sorting
  private panelInstances: Map<string, SceneCSSGridItem> = new Map();
  private panelInstancesToIngore: Set<string> = new Set();
  private changepointDetector = new SceneChangepointDetector({
    enabled: true,
  });
  private metricStates: { [metric: string]: MetricState } = {};
  private changepointDetectionComplete: { [metric: string]: boolean } = {};

  constructor(state: Partial<AnomaliesSceneState>) {
    super({
      dashboardPanelMetrics: {
        byDashboard: {},
        byDatasource: {},
        uniqueMetrics: [],
      },
      body: new SceneCSSGridLayout({
        children: [],
        autoRows: ROW_PREVIEW_HEIGHT,
        templateColumns: 'repeat(auto-fill, minmax(450px, 1fr))',
        isLazy: true,
      }),
      loading: 'idle',
      groupBy: 'none',
      sortBy: new SortByScene({
        target: 'anomalies',
      }),
      ...state,
    });

    this.addActivationHandler(this._onActivate.bind(this));
  }

  _onActivate() {
    this.setState({ loading: 'pending' });
    this._subs.add(
      this.subscribeToEvent(SortCriteriaChanged, () => {
        this.sortPanels('anomalies');
      })
    );
    // Get all metrics used in dashboards that query Prometheus data sources
    getBackendSrv()
      .get<DashboardSearchItem[]>('/api/search', {
        type: 'dash-db',
        limit: 1000,
      })
      .then((dashboards) => {
        Promise.all(
          dashboards.map(({ uid }) => getBackendSrv().get<{ dashboard: Dashboard }>(`/api/dashboards/uid/${uid}`))
        )
          .then((dashboards) => {
            const newMetrics: {
              byDashboard: { [key: string]: MetricWithMeta[] };
              byDatasource: { [key: string]: MetricWithMeta[] };
            } = {
              byDashboard: {},
              byDatasource: {},
            };

            // this helps us avoid duplicate metric names per datasource
            // when a metric is used in multiple panels
            const metricNamesByDatasource: { [key: string]: Set<string> } = {};

            for (const { dashboard } of dashboards) {
              if (!dashboard.panels?.length || !dashboard.uid) {
                continue;
              }
              const metricsInDashboard: MetricWithMeta[] = [];

              for (const panel of dashboard.panels) {
                const { datasource } = panel;
                if (!isPrometheusDataSource(datasource) || !('targets' in panel) || !panel.targets?.length) {
                  continue;
                }

                const metricsInPanel: string[] = [];
                for (const target of panel.targets) {
                  const expr = typeof target.expr === 'string' ? target.expr : '';
                  const metrics = extractMetricNames(expr);
                  metrics.forEach((metric) => metricsInPanel.push(metric));
                }

                metricsInPanel.forEach((metric) => {
                  if (!metric) {
                    return;
                  }

                  const metricWithMeta: MetricWithMeta = {
                    metric,
                    datasource: { uid: datasource.uid },
                    dashboard: { uid: dashboard.uid!, title: dashboard.title! },
                  };
                  metricsInDashboard.push(metricWithMeta);

                  if (!metricNamesByDatasource[datasource.uid]) {
                    metricNamesByDatasource[datasource.uid] = new Set<string>();
                    newMetrics.byDatasource[datasource.uid] = [];
                  }

                  if (!metricNamesByDatasource[datasource.uid].has(metric)) {
                    metricNamesByDatasource[datasource.uid].add(metric);
                    newMetrics.byDatasource[datasource.uid].push(metricWithMeta);
                  }
                });
              }

              newMetrics.byDashboard[dashboard.uid] = metricsInDashboard;
            }

            const allMetrics = Object.values(newMetrics.byDashboard).flat();
            // deduplicate metrics that appear in multiple dashboards
            const uniqueMetrics = Array.from(
              new Map(allMetrics.map((m) => [`${m.metric}-${m.datasource.uid}`, m])).values()
            );

            this.setState({
              loading: 'fulfilled',
              dashboardPanelMetrics: {
                byDashboard: newMetrics.byDashboard,
                byDatasource: newMetrics.byDatasource,
                uniqueMetrics,
              },
            });
          })
          .then(() => {
            // TODO: implement more "Group by" logic
            switch (this.state.groupBy) {
              case 'none':
                this.displayAllDashboardMetrics();
                break;
              case 'dashboard':
                this.displayDashboardMetricsByDashboard();
                break;
            }
          });
      })
      .catch(() => {
        this.setState({ loading: 'rejected' });
      });
  }

  /**
   * Display all metrics, showing only one instance of each metric even if it appears
   * in multiple dashboards.
   */
  private displayAllDashboardMetrics() {
    const children = this.state.dashboardPanelMetrics.uniqueMetrics
      .map(({ metric, datasource: { uid } }, idx) => this.getOrCreatePanelForMetric(metric, uid, idx))
      .filter(isGridItem);

    this.state.body.setState({ children });
  }

  private displayDashboardMetricsByDashboard() {
    for (const [, metrics] of Object.entries(this.state.dashboardPanelMetrics.byDashboard)) {
      const sortedMetrics = this.sortMetrics(metrics);

      const children = sortedMetrics
        .map(({ metric, datasource: { uid } }, idx) => this.getOrCreatePanelForMetric(metric, uid, idx))
        .filter(isGridItem);

      this.state.body.setState({ children });
    }
  }

  /**
   * Sort metrics based on the specified criteria:
   * - 'alphabetical': A-Z by metric name
   * - 'alphabetical-reversed': Z-A by metric name
   * - default: by number of changepoints (highest first), with complex metrics at the end
   */
  private sortMetrics(metrics: MetricWithMeta[], sortBy?: SortBy): MetricWithMeta[] {
    if (sortBy === 'alphabetical') {
      return [...metrics].sort((a, b) => a.metric.localeCompare(b.metric));
    }

    if (sortBy === 'alphabetical-reversed') {
      return [...metrics].sort((a, b) => b.metric.localeCompare(a.metric));
    }

    // Default to changepoints sorting
    return [...metrics].sort((a, b) => {
      // Put complex metrics at the end
      const aState = this.metricStates[a.metric];
      const bState = this.metricStates[b.metric];

      if (aState?.isComplexMetric && !bState?.isComplexMetric) {
        return 1;
      }
      if (!aState?.isComplexMetric && bState?.isComplexMetric) {
        return -1;
      }

      return (bState?.changepointCount || 0) - (aState?.changepointCount || 0);
    });
  }

  /**
   * Sort and rerender panels based on the current sort criteria.
   * Uses cached panel instances to prevent unnecessary recreation.
   */
  private sortPanels(sortBy: SortBy) {
    const sortedMetrics = this.sortMetrics(this.state.dashboardPanelMetrics.uniqueMetrics, sortBy);

    const children = sortedMetrics
      .map(({ metric, datasource: { uid } }, idx) => this.getOrCreatePanelForMetric(metric, uid, idx))
      .filter(isGridItem);

    this.state.body.setState({ children });
  }

  /**
   * Get an existing panel from the cache or create a new one.
   * This ensures we maintain panel identity across sorts and updates.
   */
  private getOrCreatePanelForMetric(metric: string, datasourceUid: string, index: number): SceneCSSGridItem | null {
    const key = this.getPanelKey(metric, datasourceUid);
    const shouldIgnore = this.panelInstancesToIngore.has(key);

    if (shouldIgnore) {
      return null;
    }

    // If we already have a panel for this metric+datasource, use it
    let panel = this.panelInstances.get(key);
    if (!panel) {
      const detector = this.changepointDetector.clone();
      detector.setState({
        onChangepointDetected: () => {
          this.handleChangepointDetected(metric);
        },
        onComplexMetric: () => {
          this.handleComplexMetric(metric);
        },
        onBeginChangepointDetection: () => {
          this.changepointDetectionComplete[metric] = false;
        },
        onCompleteChangepointDetection: () => {
          this.changepointDetectionComplete[metric] = true;

          // wait to sort panels until all metrics have completed changepoint detection
          if (Object.values(this.changepointDetectionComplete).every(Boolean)) {
            this.sortPanels('anomalies');
          }
        },
      });

      panel = getPreviewPanelFor(metric, index, 0, undefined, [detector], { uid: datasourceUid });

      // ensure the panel has the hideEmptyPanels behavior
      if (!panel.state.$behaviors?.includes(hideEmptyPanels(metric))) {
        panel.setState({
          $behaviors: [...(panel.state.$behaviors || []), hideEmptyPanels(metric)],
        });
      }

      this.panelInstances.set(key, panel);
    }

    return panel;
  }

  /**
   * Generate a unique key for a panel based on its metric name and datasource.
   * Used for both caching panels and ensuring React can track panel identity.
   */
  private getPanelKey(metric: string, datasourceUid: string): string {
    return `${metric}-${datasourceUid}`;
  }

  /**
   * Handle when a metric is identified as too complex for changepoint detection
   * (e.g., histograms or multi-field metrics)
   */
  private handleComplexMetric = (metric: string) => {
    this.metricStates[metric] = {
      changepointCount: 0,
      isComplexMetric: true,
    };
  };

  /**
   * Handle when a changepoint is detected in a metric's data.
   * Updates the metric's changepoint count and triggers a resort.
   */
  private handleChangepointDetected = (metric: string) => {
    const currentMetricState = this.metricStates[metric] ?? {
      changepointCount: 0,
      isComplexMetric: false,
    };

    this.metricStates[metric] = {
      ...currentMetricState,
      changepointCount: currentMetricState.changepointCount + 1,
    };
  };

  public ignorePanel(metric: string, datasourceUid: string) {
    this.panelInstancesToIngore.add(this.getPanelKey(metric, datasourceUid));
  }

  public static Component = ({ model }: SceneComponentProps<AnomaliesScene>) => {
    const { dashboardPanelMetrics, body, loading } = model.useState();
    const styles = useStyles2(getStyles);

    if (loading === 'pending') {
      return (
        <div>
          <Trans i18nKey="trail.metric-select.wingman.anomalies.loading.pending">Loading...</Trans>
        </div>
      );
    }

    if (loading === 'rejected') {
      return (
        <div>
          <Trans i18nKey="trail.metric-select.wingman.anomalies.loading.rejected">Failed to load metrics</Trans>
        </div>
      );
    }

    if (!Object.keys(dashboardPanelMetrics.byDashboard).length) {
      return (
        <div>
          <Trans i18nKey="trail.metric-select.wingman.anomalies.none-found">No metrics found</Trans>
        </div>
      );
    }

    return (
      <div className={styles.outliers}>
        <body.Component model={body} />
      </div>
    );
  };
}

interface DashboardSearchItem {
  id: number;
  uid: string;
  title: string;
  url: string;
  folderTitle?: string;
  folderUid?: string;
  tags: string[];
  isStarred: boolean;
}

function getStyles() {
  return {
    // eslint-disable-next-line @emotion/syntax-preference
    outliers: css`
      /* fix: ensure vertical placement of checkbox when controls are visible */
      button[aria-label='Enable changepoint detection'] > div > label {
        place-content: center;
      }
      /* hide the controls of the changepoint detector */
      .button-group {
        display: none;
      }
    `,
  };
}

function isPrometheusDataSource(input: unknown): input is Required<Pick<DataSourceRef, 'type' | 'uid'>> {
  return (
    typeof input === 'object' &&
    input !== null &&
    'type' in input &&
    input.type === 'prometheus' &&
    'uid' in input &&
    typeof input.uid === 'string'
  );
}

function isGridItem(item: unknown): item is SceneCSSGridItem {
  return item instanceof SceneCSSGridItem;
}
