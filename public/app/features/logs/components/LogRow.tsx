import { debounce } from 'lodash';
import { memo, MouseEvent, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  CoreApp,
  DataFrame,
  dateTimeFormat,
  Field,
  LinkModel,
  LogRowContextOptions,
  LogRowModel,
  LogsSortOrder,
} from '@grafana/data';
import { reportInteraction } from '@grafana/runtime';
import { DataQuery, TimeZone } from '@grafana/schema';
import { Icon, PopoverContent, Tooltip, useTheme2 } from '@grafana/ui';

import { checkLogsError, checkLogsSampled, escapeUnescapedString } from '../utils';

import { LogDetails } from './LogDetails';
import { LogLabels } from './LogLabels';
import { LogRowMessage } from './LogRowMessage';
import { LogRowMessageDisplayedFields } from './LogRowMessageDisplayedFields';
import { getLogLevelStyles, LogRowStyles } from './getLogRowStyles';

interface Props {
  row: LogRowModel;
  showDuplicates: boolean;
  showLabels: boolean;
  showTime: boolean;
  wrapLogMessage: boolean;
  prettifyLogMessage: boolean;
  timeZone: TimeZone;
  enableLogDetails: boolean;
  logsSortOrder?: LogsSortOrder | null;
  forceEscape?: boolean;
  app?: CoreApp;
  displayedFields?: string[];
  getRows: () => LogRowModel[];
  onClickFilterLabel?: (key: string, value: string, frame?: DataFrame) => void;
  onClickFilterOutLabel?: (key: string, value: string, frame?: DataFrame) => void;
  onContextClick?: () => void;
  getFieldLinks?: (field: Field, rowIndex: number, dataFrame: DataFrame) => Array<LinkModel<Field>>;
  showContextToggle?: (row: LogRowModel) => boolean;
  onClickShowField?: (key: string) => void;
  onClickHideField?: (key: string) => void;
  onLogRowHover?: (row?: LogRowModel) => void;
  onOpenContext: (row: LogRowModel, onClose: () => void) => void;
  getRowContextQuery?: (
    row: LogRowModel,
    options?: LogRowContextOptions,
    cacheFilters?: boolean
  ) => Promise<DataQuery | null>;
  onPermalinkClick?: (row: LogRowModel) => Promise<void>;
  styles: LogRowStyles;
  permalinkedRowId?: string;
  scrollIntoView?: (element: HTMLElement) => void;
  isFilterLabelActive?: (key: string, value: string, refId?: string) => Promise<boolean>;
  onPinLine?: (row: LogRowModel, allowUnPin?: boolean) => void;
  onUnpinLine?: (row: LogRowModel) => void;
  pinLineButtonTooltipTitle?: PopoverContent;
  pinned?: boolean;
  containerRendered?: boolean;
  handleTextSelection?: (e: MouseEvent<HTMLTableRowElement>, row: LogRowModel) => boolean;
  logRowMenuIconsBefore?: ReactNode[];
  logRowMenuIconsAfter?: ReactNode[];
  index: number;
  showDetails: boolean;
  showMenu: boolean;
  onBlur: () => void;
}

export const LogRow = memo(
  ({
    getRows,
    onClickFilterLabel,
    onClickFilterOutLabel,
    onClickShowField,
    onClickHideField,
    enableLogDetails,
    row,
    showDuplicates,
    showContextToggle,
    showLabels,
    showTime,
    displayedFields,
    wrapLogMessage,
    prettifyLogMessage,
    getFieldLinks,
    forceEscape,
    app,
    styles,
    getRowContextQuery,
    pinned,
    logRowMenuIconsBefore,
    logRowMenuIconsAfter,
    timeZone,
    permalinkedRowId,
    containerRendered,
    scrollIntoView,
    handleTextSelection,
    onLogRowHover,
    index,
    showDetails,
    showMenu,
    ...props
  }: Props) => {
    const [showingContext, setShowingContext] = useState(false);
    const [permalinked, setPermalinked] = useState(false);
    const logLineRef = useRef<HTMLTableRowElement | null>(null);
    const theme = useTheme2();

    const timestamp = useMemo(
      () =>
        dateTimeFormat(row.timeEpochMs, {
          timeZone: timeZone,
          defaultWithMS: true,
        }),
      [row.timeEpochMs, timeZone]
    );
    const levelStyles = useMemo(() => getLogLevelStyles(theme, row.logLevel), [row.logLevel, theme]);
    const processedRow = useMemo(
      () =>
        row.hasUnescapedContent && forceEscape
          ? { ...row, entry: escapeUnescapedString(row.entry), raw: escapeUnescapedString(row.raw) }
          : row,
      [forceEscape, row]
    );
    const { errorMessage, hasError } = useMemo(() => checkLogsError(row), [row]);
    const { sampleMessage, isSampled } = useMemo(() => checkLogsSampled(row), [row]);

    useEffect(() => {
      if (permalinkedRowId !== row.uid && permalinked) {
        setPermalinked(false);
        return;
      }

      if (permalinkedRowId === row.uid && !permalinked && containerRendered && logLineRef.current && scrollIntoView) {
        // at this point this row is the permalinked row, so we need to scroll to it and highlight it if possible.
        scrollIntoView(logLineRef.current);
        reportInteraction('grafana_explore_logs_permalink_opened', {
          datasourceType: row.datasourceType ?? 'unknown',
          logRowUid: row.uid,
        });
        setPermalinked(true);
      }
    }, [containerRendered, permalinked, permalinkedRowId, row.datasourceType, row.uid, scrollIntoView]);

    // we are debouncing the state change by 3 seconds to highlight the logline after the context closed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const debouncedContextClose = useCallback(
      debounce(() => {
        setShowingContext(false);
      }, 3000),
      []
    );

    const onOpenContext = useCallback(
      (row: LogRowModel) => {
        setShowingContext(true);
        props.onOpenContext(row, debouncedContextClose);
      },
      [debouncedContextClose, props]
    );

    return (
      <>
        <tr
          ref={logLineRef}
          data-index={index}
          className={`${styles.logsRow} ${hasError ? styles.errorLogRow : ''} ${showingContext || permalinked || pinned ? styles.highlightBackground : ''}`}
          /**
           * For better accessibility support, we listen to the onFocus event here (to display the LogRowMenuCell), and
           * to onBlur event in the LogRowMenuCell (to hide it). This way, the LogRowMenuCell is displayed when the user navigates
           * using the keyboard.
           */
          onFocus={undefined}
        >
          {showDuplicates && (
            <td className={styles.logsRowDuplicates}>
              {processedRow.duplicates && processedRow.duplicates > 0 ? `${processedRow.duplicates + 1}x` : null}
            </td>
          )}
          <td
            className={
              hasError || isSampled
                ? styles.logsRowWithError
                : `${levelStyles.logsRowLevelColor} ${styles.logsRowLevel}`
            }
          >
            {hasError && (
              <Tooltip content={`Error: ${errorMessage}`} placement="right" theme="error">
                <Icon className={styles.logIconError} name="exclamation-triangle" size="xs" />
              </Tooltip>
            )}
            {isSampled && (
              <Tooltip content={`${sampleMessage}`} placement="right" theme="info">
                <Icon className={styles.logIconInfo} name="info-circle" size="xs" />
              </Tooltip>
            )}
          </td>
          <td
            title={enableLogDetails ? (showDetails ? 'Hide log details' : 'See log details') : ''}
            className={enableLogDetails ? styles.logsRowToggleDetails : ''}
          >
            {enableLogDetails && (
              <Icon className={styles.topVerticalAlign} name={showDetails ? 'angle-down' : 'angle-right'} />
            )}
          </td>
          {showTime && <td className={styles.logsRowLocalTime}>{timestamp}</td>}
          {showLabels && processedRow.uniqueLabels && (
            <td className={styles.logsRowLabels}>
              <LogLabels labels={processedRow.uniqueLabels} addTooltip={false} />
            </td>
          )}
          {displayedFields && displayedFields.length > 0 ? (
            <LogRowMessageDisplayedFields
              row={processedRow}
              showContextToggle={showContextToggle}
              detectedFields={displayedFields}
              getFieldLinks={getFieldLinks}
              wrapLogMessage={wrapLogMessage}
              onOpenContext={onOpenContext}
              onPermalinkClick={props.onPermalinkClick}
              styles={styles}
              onPinLine={props.onPinLine}
              onUnpinLine={props.onUnpinLine}
              pinned={pinned}
              mouseIsOver={showMenu}
              logRowMenuIconsBefore={logRowMenuIconsBefore}
              logRowMenuIconsAfter={logRowMenuIconsAfter}
              onBlur={props.onBlur}
            />
          ) : (
            <LogRowMessage
              row={processedRow}
              showContextToggle={showContextToggle}
              getRowContextQuery={getRowContextQuery}
              wrapLogMessage={wrapLogMessage}
              prettifyLogMessage={prettifyLogMessage}
              onOpenContext={onOpenContext}
              onPermalinkClick={props.onPermalinkClick}
              app={app}
              styles={styles}
              onPinLine={props.onPinLine}
              onUnpinLine={props.onUnpinLine}
              pinLineButtonTooltipTitle={props.pinLineButtonTooltipTitle}
              pinned={pinned}
              mouseIsOver={showMenu}
              expanded={showDetails}
              logRowMenuIconsBefore={logRowMenuIconsBefore}
              logRowMenuIconsAfter={logRowMenuIconsAfter}
              onBlur={props.onBlur}
            />
          )}
        </tr>
        {showDetails && (
          <LogDetails
            onPinLine={props.onPinLine}
            className={`${styles.logsRow} ${hasError ? styles.errorLogRow : ''} ${permalinked && !showDetails ? styles.highlightBackground : ''}`}
            showDuplicates={showDuplicates}
            getFieldLinks={getFieldLinks}
            onClickFilterLabel={onClickFilterLabel}
            onClickFilterOutLabel={onClickFilterOutLabel}
            onClickShowField={onClickShowField}
            onClickHideField={onClickHideField}
            getRows={getRows}
            row={processedRow}
            wrapLogMessage={wrapLogMessage}
            hasError={hasError}
            displayedFields={displayedFields}
            app={app}
            styles={styles}
            isFilterLabelActive={props.isFilterLabelActive}
            pinLineButtonTooltipTitle={props.pinLineButtonTooltipTitle}
          />
        )}
      </>
    );
  }
);
