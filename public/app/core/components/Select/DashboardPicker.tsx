import debounce from 'debounce-promise';
import { useCallback, useEffect, useState } from 'react';

import { SelectableValue } from '@grafana/data';
import { config } from '@grafana/runtime';
import { AsyncSelectProps, AsyncSelect } from '@grafana/ui';
import { backendSrv } from 'app/core/services/backend_srv';
import { AnnoKeyFolder, AnnoKeyFolderTitle } from 'app/features/apiserver/types';
import { getDashboardAPI } from 'app/features/dashboard/api/dashboard_api';
import { DashboardWithAccessInfo } from 'app/features/dashboard/api/types';
import { DashboardSearchItem } from 'app/features/search/types';
import { DashboardDTO } from 'app/types';

interface Props extends Omit<AsyncSelectProps<DashboardPickerDTO>, 'value' | 'onChange' | 'loadOptions' | ''> {
  value?: DashboardPickerDTO['uid'];
  onChange?: (value?: DashboardPickerDTO) => void;
}

export type DashboardPickerDTO = Pick<DashboardDTO['dashboard'], 'uid' | 'title'> &
  Pick<DashboardDTO['meta'], 'folderUid' | 'folderTitle'>;

const formatLabel = (folderTitle = 'Dashboards', dashboardTitle: string) => `${folderTitle}/${dashboardTitle}`;

async function findDashboards(query = '') {
  return backendSrv.search({ type: 'dash-db', query, limit: 100 }).then((result: DashboardSearchItem[]) => {
    return result.map((item: DashboardSearchItem) => ({
      value: {
        // dashboards uid here is always defined as this endpoint does not return the default home dashboard
        uid: item.uid!,
        title: item.title,
        folderTitle: item.folderTitle,
        folderUid: item.folderUid,
      },
      label: formatLabel(item?.folderTitle, item.title),
    }));
  });
}

const getDashboards = debounce(findDashboards, 250, { leading: true });

// TODO: this component should provide a way to apply different filters to the search APIs
export const DashboardPicker = ({
  value,
  onChange,
  placeholder = 'Select dashboard',
  noOptionsMessage = 'No dashboards found',
  ...props
}: Props) => {
  const [current, setCurrent] = useState<SelectableValue<DashboardPickerDTO>>();

  // This is required because the async select does not match the raw uid value
  // We can not use a simple Select because the dashboard search should not return *everything*
  useEffect(() => {
    if (!value || value === current?.value?.uid) {
      return;
    }

    (async () => {
      // value was manually changed from outside or we are rendering for the first time.
      // We need to fetch dashboard information.
      // when using getDashboardAPI, if isV2Mode is not set, we will always return the v1 schema version
      // isV2Mode is set to true when the feature toggle of dashboardSchemaV2 and useV2DashboardsAPI is enabled
      // We could create a different feature toggle with better naming if we want, but the idea of using
      // dashboardSchemaV2 is to indicate that this component is ready to process the new schema
      const isUIReadyForV2 = config.featureToggles.useV2DashboardsAPI;

      if (isUIReadyForV2) {
        const resWithSchemaV2 = await getDashboardAPI('v2').getDashboardDTO(value, undefined);

        setCurrent({
          value: {
            uid: resWithSchemaV2.metadata.name,
            title: resWithSchemaV2.spec.title,
            folderTitle: resWithSchemaV2.metadata.annotations?.[AnnoKeyFolderTitle],
            folderUid: resWithSchemaV2.metadata.annotations?.[AnnoKeyFolder],
          },
          label: formatLabel(resWithSchemaV2.metadata.annotations?.[AnnoKeyFolder], resWithSchemaV2.spec.title),
        });
      } else {
        // this means that the dashboard returned is a v1 schema
        const resWithSchemaV1 = await getDashboardAPI().getDashboardDTO(value, undefined);
        if (resWithSchemaV1.dashboard) {
          setCurrent({
            value: {
              uid: resWithSchemaV1.dashboard.uid,
              title: resWithSchemaV1.dashboard.title,
              folderTitle: resWithSchemaV1.meta.folderTitle,
              folderUid: resWithSchemaV1.meta.folderUid,
            },
            label: formatLabel(resWithSchemaV1.meta?.folderTitle, resWithSchemaV1.dashboard.title),
          });
        }
      }
    })();
    // we don't need to rerun this effect every time `current` changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const onPicked = useCallback(
    (sel: SelectableValue<DashboardPickerDTO>) => {
      setCurrent(sel);
      onChange?.(sel?.value);
    },
    [onChange, setCurrent]
  );

  return (
    <AsyncSelect
      loadOptions={getDashboards}
      onChange={onPicked}
      placeholder={placeholder}
      noOptionsMessage={noOptionsMessage}
      value={current}
      defaultOptions={true}
      {...props}
    />
  );
};
