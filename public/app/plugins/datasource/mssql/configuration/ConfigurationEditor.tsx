import React, { SyntheticEvent } from 'react';

import {
  DataSourcePluginOptionsEditorProps,
  onUpdateDatasourceJsonDataOption,
  onUpdateDatasourceSecureJsonDataOption,
  SelectableValue,
  updateDatasourcePluginJsonDataOption,
  updateDatasourcePluginResetOption,
} from '@grafana/data';
import { Alert, FieldSet, InlineField, InlineFieldRow, InlineSwitch, Input, Select } from '@grafana/ui';
import { SecretInput } from '@grafana/ui/src/components/SecretInput/SecretInput';
import { ConnectionLimits } from 'app/features/plugins/sql/components/configuration/ConnectionLimits';

import { MSSQLAuthenticationType, MSSQLEncryptOptions, MssqlOptions } from '../types';

export const ConfigurationEditor = (props: DataSourcePluginOptionsEditorProps<MssqlOptions>) => {
  const { options, onOptionsChange } = props;
  const jsonData = options.jsonData;

  const onResetPassword = () => {
    updateDatasourcePluginResetOption(props, 'password');
  };

  const onDSOptionChanged = (property: keyof MssqlOptions) => {
    return (event: SyntheticEvent<HTMLInputElement>) => {
      onOptionsChange({ ...options, ...{ [property]: event.currentTarget.value } });
    };
  };

  const onSkipTLSVerifyChanged = (event: SyntheticEvent<HTMLInputElement>) => {
    updateDatasourcePluginJsonDataOption(props, 'tlsSkipVerify', event.currentTarget.checked);
  };

  const onEncryptChanged = (value: SelectableValue) => {
    updateDatasourcePluginJsonDataOption(props, 'encrypt', value.value);
  };

  const onAuthenticationMethodChanged = (value: SelectableValue) => {
    onOptionsChange({
      ...options,
      ...{
        jsonData: { ...jsonData, ...{ authenticationType: value.value } },
        secureJsonData: { ...options.secureJsonData, ...{ password: '' } },
        secureJsonFields: { ...options.secureJsonFields, ...{ password: false } },
        user: '',
      },
    });
  };

  const authenticationOptions: Array<SelectableValue<MSSQLAuthenticationType>> = [
    { value: MSSQLAuthenticationType.sqlAuth, label: 'SQL Server Authentication' },
    { value: MSSQLAuthenticationType.windowsAuth, label: 'Windows Authentication' },
  ];

  const encryptOptions: Array<SelectableValue<string>> = [
    { value: MSSQLEncryptOptions.disable, label: 'disable' },
    { value: MSSQLEncryptOptions.false, label: 'false' },
    { value: MSSQLEncryptOptions.true, label: 'true' },
  ];

  const shortWidth = 15;
  const longWidth = 46;
  const labelWidthSSL = 25;

  return (
    <>
      <FieldSet label="MS SQL Connection" width={400}>
        <InlineField labelWidth={shortWidth} label="Host">
          <Input
            width={longWidth}
            name="host"
            type="text"
            value={options.url || ''}
            placeholder="localhost:1433"
            onChange={onDSOptionChanged('url')}
          ></Input>
        </InlineField>
        <InlineField labelWidth={shortWidth} label="Database">
          <Input
            width={longWidth}
            name="database"
            value={options.database || ''}
            placeholder="datbase name"
            onChange={onDSOptionChanged('database')}
          ></Input>
        </InlineField>
        <InlineField
          label="Authentication"
          labelWidth={shortWidth}
          tooltip={
            <ul>
              <li>
                <i>SQL Server Authentication</i> This is the default mechanism to connect to MS SQL Server. Enter the
                SQL Server Authentication login or the Windows Authentication login in the DOMAIN\User format.
              </li>
              <li>
                <i>Windows Authentication</i> Windows Integrated Security - single sign on for users who are already
                logged onto Windows and have enabled this option for MS SQL Server.
              </li>
            </ul>
          }
        >
          <Select
            value={jsonData.authenticationType || MSSQLAuthenticationType.sqlAuth}
            options={authenticationOptions}
            onChange={onAuthenticationMethodChanged}
          ></Select>
        </InlineField>
        {jsonData.authenticationType === MSSQLAuthenticationType.windowsAuth ? null : (
          <InlineFieldRow>
            <InlineField labelWidth={shortWidth} label="User">
              <Input
                width={shortWidth}
                value={options.user || ''}
                placeholder="user"
                onChange={onDSOptionChanged('user')}
              ></Input>
            </InlineField>
            <InlineField label="Password" labelWidth={shortWidth}>
              <SecretInput
                width={shortWidth}
                placeholder="Password"
                isConfigured={options.secureJsonFields && options.secureJsonFields.password}
                onReset={onResetPassword}
                onBlur={onUpdateDatasourceSecureJsonDataOption(props, 'password')}
              ></SecretInput>
            </InlineField>
          </InlineFieldRow>
        )}
      </FieldSet>

      <FieldSet label="TLS/SSL Auth">
        <InlineField
          labelWidth={labelWidthSSL}
          tooltip={
            <span>
              Determines whether or to which extent a secure SSL TCP/IP connection will be negotiated with the server.
              <ul>
                <li>
                  <i>disable</i> - Data sent between client and server is not encrypted.
                </li>
                <li>
                  <i>false</i> - Data sent between client and server is not encrypted beyond the login packet. (default)
                </li>
                <li>
                  <i>true</i> - Data sent between client and server is encrypted.
                </li>
              </ul>
              If you&apos;re using an older version of Microsoft SQL Server like 2008 and 2008R2 you may need to disable
              encryption to be able to connect.
            </span>
          }
          label="Encrypt"
        >
          <Select
            options={encryptOptions}
            value={jsonData.encrypt || MSSQLEncryptOptions.disable}
            onChange={onEncryptChanged}
          ></Select>
        </InlineField>

        {jsonData.encrypt === MSSQLEncryptOptions.true ? (
          <>
            <InlineField labelWidth={labelWidthSSL} label="Skip TLS Verify">
              <InlineSwitch onChange={onSkipTLSVerifyChanged} value={jsonData.tlsSkipVerify || false}></InlineSwitch>
            </InlineField>
            {jsonData.tlsSkipVerify ? null : (
              <>
                <InlineField
                  labelWidth={labelWidthSSL}
                  tooltip={
                    <span>
                      Path to file containing the public key certificate of the CA that signed the SQL Server
                      certificate. Needed when the server certificate is self signed.
                    </span>
                  }
                  label="TLS/SSL Root Certificate"
                >
                  <Input
                    value={jsonData.sslRootCertFile || ''}
                    onChange={onUpdateDatasourceJsonDataOption(props, 'sslRootCertFile')}
                    placeholder="TLS/SSL root certificate file path"
                  ></Input>
                </InlineField>
                <InlineField labelWidth={labelWidthSSL} label="Hostname in server certificate">
                  <Input
                    placeholder="Common Name (CN) in server certificate"
                    value={jsonData.serverName || ''}
                    onChange={onUpdateDatasourceJsonDataOption(props, 'serverName')}
                  ></Input>
                </InlineField>
              </>
            )}
          </>
        ) : null}
      </FieldSet>

      <ConnectionLimits
        labelWidth={shortWidth}
        jsonData={jsonData}
        onPropertyChanged={(property, value) => {
          updateDatasourcePluginJsonDataOption(props, property, value);
        }}
      ></ConnectionLimits>

      <FieldSet label="MS SQL details">
        <InlineField
          tooltip={
            <span>
              A lower limit for the auto group by time interval. Recommended to be set to write frequency, for example
              <code>1m</code> if your data is written every minute.
            </span>
          }
          label="Min time interval"
        >
          <Input
            placeholder="1m"
            value={jsonData.timeInterval || ''}
            onChange={onUpdateDatasourceJsonDataOption(props, 'timeInterval')}
          ></Input>
        </InlineField>
      </FieldSet>

      <Alert title="User Permission" severity="info">
        The database user should only be granted SELECT permissions on the specified database and tables you want to
        query. Grafana does not validate that queries are safe so queries can contain any SQL statement. For example,
        statements like <code>USE otherdb;</code> and <code>DROP TABLE user;</code> would be executed. To protect
        against this we <em>highly</em> recommmend you create a specific MS SQL user with restricted permissions.
      </Alert>
    </>
  );
};
