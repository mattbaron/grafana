import debounce from 'debounce-promise';
import { useCallback, useEffect, useState } from 'react';

import { SelectableValue } from '@grafana/data';
import { AsyncSelectProps, AsyncSelect } from '@grafana/ui';
import { backendSrv } from 'app/core/services/backend_srv';
import { ResponseTransformers } from 'app/features/dashboard/api/ResponseTransformers';
import { getDashboardAPI } from 'app/features/dashboard/api/dashboard_api';
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
      const res = await getDashboardAPI().getDashboardDTO(value, undefined);
      const formatted = ResponseTransformers.ensureV1Response(res);

      if (formatted.dashboard) {
        setCurrent({
          value: {
            uid: formatted.dashboard.uid,
            title: formatted.dashboard.title,
            folderTitle: formatted.meta.folderTitle,
            folderUid: formatted.meta.folderUid,
          },
          label: formatLabel(formatted.meta?.folderTitle, formatted.dashboard.title),
        });
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
