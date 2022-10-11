import { css, cx } from '@emotion/css';
import React, { useMemo } from 'react';
import ReactGridLayout from 'react-grid-layout';
import AutoSizer from 'react-virtualized-auto-sizer';

import { GrafanaTheme2 } from '@grafana/data';
import { Icon, useStyles2 } from '@grafana/ui';
import { DEFAULT_ROW_HEIGHT, GRID_CELL_HEIGHT, GRID_CELL_VMARGIN, GRID_COLUMN_COUNT } from 'app/core/constants';

import { SceneObjectBase } from '../../core/SceneObjectBase';
import { SceneComponentProps, SceneLayoutState } from '../../core/types';

interface SceneGridLayoutState extends SceneLayoutState {
  children: Array<SceneGridCell | SceneGridRow>;
}

type GridCellLayout = {
  x: number;
  y: number;
  width: number;
  height: number;
};

// TODO: Separet children and size propertions into separate interfaces
interface SceneGridCellState extends Omit<SceneLayoutState, 'size'> {
  isResizable?: boolean;
  isDraggable?: boolean;
  size: GridCellLayout;
}

export class SceneGridLayout extends SceneObjectBase<SceneGridLayoutState> {
  static Component = SceneGridLayoutRenderer;

  updateLayout() {
    this.setState({
      children: [...this.state.children],
    });
  }

  onResizeStop: ReactGridLayout.ItemCallback = (_, o, n) => {
    const child = this.state.children.find((c) => c.state.key === n.i);
    if (!child) {
      return;
    }
    child.setState({
      size: {
        ...child.state.size,
        width: n.w,
        height: n.h,
      },
    });
  };

  onDragStop: ReactGridLayout.ItemCallback = (l, o, n) => {
    // Update children positions if they have changed
    for (let i = 0; i < l.length; i++) {
      const child = this.state.children[i];
      const childSize = child.state.size;
      const childLayout = l[i];
      if (
        childSize?.x !== childLayout.x ||
        childSize?.y !== childLayout.y ||
        childSize?.width !== childLayout.w ||
        childSize?.height !== childLayout.h
      ) {
        child.setState({
          size: {
            ...child.state.size,
            x: childLayout.x,
            y: childLayout.y,
          },
        });
      }
    }
  };
}

function SceneGridLayoutRenderer({ model }: SceneComponentProps<SceneGridLayout>) {
  const { children } = model.useState();

  const layout = useMemo(() => {
    return children.map((child) => {
      const size = child.state.size;
      if (child instanceof SceneGridRow) {
        console.log(child.state);
      }
      const resizeHandles: ReactGridLayout.Layout['resizeHandles'] =
        child instanceof SceneGridRow && Boolean(child.state.isResizable) ? ['s'] : undefined;
      return {
        i: child.state.key!,
        x: size.x,
        y: size.y,
        w: size.width,
        h: size.height,
        isResizable: Boolean(child.state.isResizable),
        isDraggable: Boolean(child.state.isDraggable),
        resizeHandles,
      };
    });
  }, [children]);

  return (
    <AutoSizer disableHeight>
      {({ width }) => {
        if (width === 0) {
          return null;
        }

        // const draggable = width <= 769 ? false : dashboard.meta.canEdit;

        /*
            Disable draggable if mobile device, solving an issue with unintentionally
            moving panels. https://github.com/grafana/grafana/issues/18497
            theme.breakpoints.md = 769
          */

        return (
          /**
           * The children is using a width of 100% so we need to guarantee that it is wrapped
           * in an element that has the calculated size given by the AutoSizer. The AutoSizer
           * has a width of 0 and will let its content overflow its div.
           */
          <div style={{ width: `${width}px`, height: '100%' }}>
            <ReactGridLayout
              width={width}
              isDraggable={false}
              isResizable={false}
              containerPadding={[0, 0]}
              useCSSTransforms={false}
              margin={[GRID_CELL_VMARGIN, GRID_CELL_VMARGIN]}
              cols={GRID_COLUMN_COUNT}
              rowHeight={GRID_CELL_HEIGHT}
              draggableHandle=".grid-drag-handle"
              layout={layout}
              onDragStop={model.onDragStop}
              onResizeStop={model.onResizeStop}
              isBounded={true}
            >
              {children.map((child) => {
                return (
                  <div key={child.state.key}>
                    {/* eslint-disable-next-line */}
                    <child.Component model={child as any} key={child.state.key} />
                  </div>
                );
              })}
            </ReactGridLayout>
          </div>
        );
      }}
    </AutoSizer>
  );
}

export class SceneGridCell extends SceneObjectBase<SceneGridCellState> {
  static Component = SceneGridCellRenderer;
}

function SceneGridCellRenderer({ model }: SceneComponentProps<SceneGridCell>) {
  const { isDraggable } = model.useState();
  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', zIndex: 0 }}>
      {/* TODO: This is a temporary solution to make the grid cell draggable*/}
      {isDraggable && <SceneGridDragHandle />}
      <>
        {model.state.children.map((child) => {
          return <child.Component key={child.state.key} model={child} />;
        })}
      </>
    </div>
  );
}

function SceneGridDragHandle() {
  return (
    <div
      className="grid-drag-handle"
      style={{
        width: '20px',
        height: '20px',
        position: 'absolute',
        top: '5px',
        right: '5px',
        zIndex: 1,
        cursor: 'move',
      }}
    >
      <Icon name="draggabledots" />
    </div>
  );
}

interface SceneGridRowState extends Omit<SceneGridCellState, 'size'> {
  title: string;
  size: GridCellLayout;
  isCollapsible?: boolean;
  isDraggable?: boolean;
  isCollapsed?: boolean;
}

export class SceneGridRow extends SceneObjectBase<SceneGridRowState> {
  static Component = SceneGridRowRenderer;
  private _originalHeight = 0;

  constructor(
    state: Omit<SceneGridRowState, 'size'> & { size: Pick<GridCellLayout, 'x' | 'y' | 'height'> & { width?: number } }
  ) {
    super({
      isResizable: true,
      isDraggable: true,
      isCollapsible: true,
      ...state,
      isCollapsed: Boolean(state.isCollapsed),
      size: {
        ...state.size,
        height: state.isCollapsed ? GRID_CELL_HEIGHT : state.size?.height || DEFAULT_ROW_HEIGHT,
        width: state.size.width || GRID_COLUMN_COUNT,
      },
    });

    this._originalHeight = parseInt(
      (state.isCollapsed ? GRID_CELL_HEIGHT : state.size?.height || DEFAULT_ROW_HEIGHT).toString(),
      10
    );

    this.subs = this.subscribe({
      next: (state) => {
        // Preserve the height of the row to be able to restore it when uncollapsing
        if (
          state.size &&
          state.size.height &&
          state.size.height !== this._originalHeight &&
          state.size?.height !== GRID_CELL_HEIGHT &&
          !state.isCollapsed
        ) {
          this._originalHeight = parseInt(state.size.height?.toString(), 10);
        }
      },
    });
  }

  onCollapseToggle = () => {
    if (!this.state.isCollapsible) {
      return;
    }
    const layout = this.parent;

    if (!layout || !(layout instanceof SceneGridLayout)) {
      throw new Error('SceneGridRow must be a child of SceneGridLayout');
    }

    const { isCollapsed, size } = this.state;
    if (!size) {
      return;
    }

    if (layout) {
      if (isCollapsed) {
        this.setState({ isCollapsed: false, isResizable: true, size: { ...size, height: this._originalHeight } });
      } else {
        this.setState({ isCollapsed: true, isResizable: false, size: { ...size, height: 1 } });
      }
      layout.updateLayout();
    }
  };
}

function SceneGridRowRenderer({ model }: SceneComponentProps<SceneGridRow>) {
  const styles = useStyles2(getSceneGridRowStyles);
  const { isCollapsible, isCollapsed, isDraggable, title } = model.useState();

  return (
    <div className={styles.row}>
      <div className={cx(styles.rowHeader, isCollapsed && styles.rowHeaderCollapsed)}>
        <div onClick={model.onCollapseToggle} className={styles.rowTitleWrapper}>
          {isCollapsible && <Icon name={isCollapsed ? 'angle-right' : 'angle-down'} />}
          <span className={styles.rowTitle}>{title}</span>
        </div>
        {isDraggable && (
          <div>
            <SceneGridDragHandle />
          </div>
        )}
      </div>

      {!isCollapsed && (
        <div style={{ flexGrow: 1, height: 'calc(100%-30px)', width: '100%' }}>
          {model.state.children.map((child) => {
            return <child.Component key={child.state.key} model={child} />;
          })}
        </div>
      )}
    </div>
  );
}

const getSceneGridRowStyles = (theme: GrafanaTheme2) => {
  return {
    row: css({
      width: '100%',
      height: '100%',
      position: 'relative',
      zIndex: 0,
      display: 'flex',
      flexDirection: 'column',
    }),
    rowHeader: css({
      width: '100%',
      height: '30px',
      display: 'flex',
      justifyContent: 'space-between',
      marginBottom: '8px',
      border: `1px solid transparent`,
    }),
    rowTitleWrapper: css({
      display: 'flex',
      alignItems: 'center',
      cursor: 'pointer',
    }),
    rowHeaderCollapsed: css({
      marginBottom: '0px',
      background: theme.colors.background.primary,
      border: `1px solid ${theme.colors.border.weak}`,
      borderRadius: theme.shape.borderRadius(1),
    }),
    rowTitle: css({
      fontSize: theme.typography.h6.fontSize,
      fontWeight: theme.typography.h6.fontWeight,
    }),
  };
};
