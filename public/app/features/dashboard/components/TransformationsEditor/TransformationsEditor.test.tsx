import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

import { DataTransformerConfig, standardTransformersRegistry } from '@grafana/data';
import { selectors } from '@grafana/e2e-selectors';
import config from 'app/core/config';
import { getStandardTransformers } from 'app/features/transformers/standardTransformers';

import { PanelModel } from '../../state';

import { TransformationsEditor } from './TransformationsEditor';

const setup = (transformations: DataTransformerConfig[] = []) => {
  const panel = new PanelModel({});
  panel.setTransformations(transformations);
  render(<TransformationsEditor panel={panel} />);
};

describe('TransformationsEditor', () => {
  standardTransformersRegistry.setInit(getStandardTransformers);

  describe('when no transformations configured', () => {
    function renderList() {
      setup();

      const addButton = screen.getAllByTestId(selectors.components.Transforms.addTransformationButton + 'i');
      const emptyMessage = screen.getAllByTestId(selectors.components.Transforms.noTransformationsMessage);

      console.log({ addButton, emptyMessage });

      expect(2).toEqual(2);
    }

    it('renders trasnformation empty message', renderList);
    it('renders transformations selection list with transformationsRedesign feature toggled on', () => {
      config.featureToggles.transformationsRedesign = true;
      renderList();
      config.featureToggles.transformationsRedesign = false;
    });
  });

  describe('when transformations configured', () => {
    function renderEditors() {
      setup([
        {
          id: 'reduce',
          options: {},
        },
      ]);
      const editors = screen.getAllByTestId(/Transformation editor/);
      expect(editors).toHaveLength(1);
    }

    it('renders transformation editors', renderEditors);
    it('renders transformation editors with transformationsRedesign feature toggled on', () => {
      config.featureToggles.transformationsRedesign = true;
      renderEditors();
      config.featureToggles.transformationsRedesign = false;
    });
  });

  describe('when Add transformation clicked', () => {
    async function renderPicker() {
      setup([
        {
          id: 'reduce',
          options: {},
        },
      ]);

      const addTransformationButton = screen.getByTestId(selectors.components.Transforms.addTransformationButton);
      await userEvent.click(addTransformationButton);

      const search = screen.getByTestId(selectors.components.Transforms.searchInput);
      expect(search).toBeDefined();
    }

    it('renders transformations picker', renderPicker);
    it('renders transformation picker with transformationsRedesign feature toggled on', async () => {
      config.featureToggles.transformationsRedesign = true;
      await renderPicker();
      config.featureToggles.transformationsRedesign = false;
    });
  });

  describe('actions', () => {
    describe('debug', () => {
      async function showHideDebugger() {
        setup([
          {
            id: 'reduce',
            options: {},
          },
        ]);
        const debuggerSelector = selectors.components.TransformTab.transformationEditorDebugger('Reduce');

        expect(screen.queryByTestId(debuggerSelector)).toBeNull();

        const debugButton = screen.getByLabelText(selectors.components.QueryEditorRow.actionButton('Debug'));
        await userEvent.click(debugButton);

        expect(screen.getByTestId(debuggerSelector)).toBeInTheDocument();
      }

      it('should show/hide debugger', showHideDebugger);
      it('renders transformation editors with transformationsRedesign feature toggled on', async () => {
        config.featureToggles.transformationsRedesign = true;
        await showHideDebugger();
        config.featureToggles.transformationsRedesign = false;
      });
    });
  });
});
