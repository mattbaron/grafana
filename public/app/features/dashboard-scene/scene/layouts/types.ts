import { RegistryItem } from '@grafana/data';
import { SceneObject, SceneVariableSet, VizPanel } from '@grafana/scenes';
import { OptionsPaneItemDescriptor } from 'app/features/dashboard/components/PanelEditor/OptionsPaneItemDescriptor';

export interface DashboardLayoutManager extends SceneObject {
  /**
   * Notify the layout manager that the edit mode has changed
   * @param isEditing
   */
  editModeChanged(isEditing: boolean): void;
  /**
   * We should be able to figure out how to add the explore panel in a way that leaves the
   * initialSaveModel clean from it so we can leverage the default discard changes logic.
   * Then we can get rid of this.
   */
  cleanUpStateFromExplore?(): void;
  /**
   * Not sure we will need this in the long run, we should be able to handle this inside internally
   */
  getNextPanelId(): number;
  /**
   * Used for transferring elements between layouts.
   */
  getElements(): DashboardLayoutElement[];
  /**
   * Remove an elemenet / panel
   * @param element
   */
  removeElement(element: DashboardLayoutElement): void;
  /**
   * Creates a copy of an existing element and adds it to the layout
   * @param element
   */
  duplicateElement(element: DashboardLayoutElement): void;
  /**
   * Renders options and layout actions
   */
  renderEditor?(): React.ReactNode;
  /**
   * Get's the layout descriptor (which has the name and id)
   */
  getDescriptor(): LayoutRegistryItem;
  /**
   * Turn into a save model
   * @param saveModel
   */
  toSaveModel?(): any;
}

/**
 * The layout descriptor used when selecting / switching layouts
 */
export interface LayoutRegistryItem extends RegistryItem {
  /**
   * When switching between layouts
   * @param currentLayout
   */
  createFromLayout(currentLayout: DashboardLayoutManager): DashboardLayoutManager;
  /**
   * Create from persisted state
   * @param saveModel
   */
  createFromSaveModel?(saveModel: any): void;
}

export interface LayoutEditorProps<T> {
  layoutManager: T;
}

/**
 * This interface is needed to support layouts existing on different levels of the scene (DashboardScene and inside the TabsLayoutManager)
 */
export interface LayoutParent extends SceneObject {
  switchLayout(newLayout: DashboardLayoutManager): void;
}

export function isLayoutParent(obj: SceneObject): obj is LayoutParent {
  return 'switchLayout' in obj;
}

/**
 * Abstraction to handle editing of different layout elements (wrappers for VizPanels and other objects)
 * Also useful to when rendering / viewing an element outside it's layout scope
 */
export interface DashboardLayoutElement extends SceneObject {
  /**
   * Marks this object as a layout element
   */
  isDashboardLayoutElement: true;
  /**
   * Return layout elements options (like repeat, repeat direction, etc for the default DashboardGridItem)
   */
  getOptions?(): OptionsPaneItemDescriptor[];
  /**
   * Needed when for example editing
   */
  getVariableScope?(): SceneVariableSet | undefined;
  /**
   * Used by panel edit to commit changes
   */
  setBody(body: SceneObject): void;
  /**
   * Only implemented by elements that wrap VizPanels
   */
  getVizPanel?(): VizPanel;
}

export function isDashboardLayoutElement(obj: SceneObject): obj is DashboardLayoutElement {
  return 'isDashboardLayoutElement' in obj;
}
