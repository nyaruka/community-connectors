/* eslint-disable prefer-rest-params */
/* eslint-disable prefer-spread */

// returns our auth type. We don't use any built in auth because we want people to be able
// to connect more than one RapidPro account and API tokens are per account
function getAuthType() {
  return {type: 'NONE'};
}

// returns whether this user is an admin user
function isAdminUser() {
  return false;
}

// Gets the config for this connector.
//
// Our config is multiple steps:
//   1. Select your endpoint (RapidPro, TextIt, Custom..)
//   1a. If custom, enter the URL of the endpoint
//   2. Enter your API token
//   3. Select the flow you want to import results for
function getConfig(request) {
  var cc = DataStudioApp.createCommunityConnector();
  var config = cc.getConfig();

  // start off with the base URL, can be one of the large RapidPro installs or a custom URL
  var baseURL = config
    .newSelectSingle()
    .setId('base_url')
    .setName('Base URL')
    .setIsDynamic(true)
    .setHelpText('The base URL for your RapidPro installation');

  baseURL.addOption(
    config
      .newOptionBuilder()
      .setLabel('https://app.rapidpro.io - RapidPro')
      .setValue('https://app.rapidpro.io')
  );
  baseURL.addOption(
    config
      .newOptionBuilder()
      .setLabel('https://textit.in - TextIt')
      .setValue('https://textit.in')
  );
  baseURL.addOption(
    config
      .newOptionBuilder()
      .setLabel('Other')
      .setValue('other')
  );

  // if they haven't picked an option yet, we are done with this step
  if (request.configParams === undefined) {
    config.setIsSteppedConfig(true);
    return config.build();
  }

  // custom URL, only used in the case of base URL being set to "other"
  var customURL = config
    .newTextInput()
    .setId('custom_url')
    .setName('Custom Base URL')
    .setIsDynamic(true)
    .setHelpText(
      'The base URL for your RapidPro endpoint (including http/https)'
    );

  // if they selected "other" as theyr base_url, need to ask them what that is
  if (
    request.configParams.base_url == 'other' &&
    request.configParams.custom_url === undefined
  ) {
    config.setIsSteppedConfig(true);
    return config.build();
  }

  // now ask for their auth token
  var apiToken = config
    .newTextInput()
    .setId('api_token')
    .setName('API Token')
    .setIsDynamic(true)
    .setHelpText(
      'The API Token for your account, find it on your account page'
    );

  if (request.configParams.api_token == undefined) {
    config.setIsSteppedConfig(true);
    return config.build();
  }

  // and let them select from recent flows
  var flows = config
    .newSelectSingle()
    .setId('flow_uuid')
    .setName('Flow')
    .setHelpText('Select the flow you want to import data for');
  results = getRecentFlows(request.configParams);
  for (var i = 0; i < results.length; i++) {
    var flow = results[i];
    flows.addOption(
      config
        .newOptionBuilder()
        .setLabel(flow.name)
        .setValue(flow.uuid)
    );
  }

  return config.build();
}

// gets the appropriate base URL to use based on the passed in config
function getBaseURL(config) {
  var baseURL = config.base_url;
  if (baseURL == 'other') {
    baseURL = config.custom_url;
  }
  return baseURL;
}

// gets the most recent flows for the passed in configuration
function getRecentFlows(config) {
  var options = {
    contentType: 'application/json',
    headers: {
      Authorization: 'Token ' + config.api_token
    }
  };

  var response = UrlFetchApp.fetch(
    getBaseURL(config) + '/api/v2/flows.json?archived=false',
    options
  );
  return JSON.parse(response).results;
}

// getFields returns the available fields for the configured flow
function getFields(request) {
  var cc = DataStudioApp.createCommunityConnector();
  var fields = cc.getFields();
  var types = cc.FieldType;
  var aggregations = cc.AggregationType;

  var options = {
    contentType: 'application/json',
    headers: {
      Authorization: 'Token ' + request.configParams.api_token
    }
  };
  var response = UrlFetchApp.fetch(
    getBaseURL(request.configParams) +
      '/api/v2/flows.json?uuid=' +
      request.configParams.flow_uuid,
    options
  );
  var results = JSON.parse(response).results;

  var urn = fields
    .newDimension()
    .setId('_contact_urn')
    .setName('Contact URN')
    .setType(types.TEXT);

  fields
    .newDimension()
    .setId('_contact_uuid')
    .setName('Contact UUID')
    .setType(types.TEXT);

  fields
    .newDimension()
    .setId('_contact_name')
    .setName('Contact Name')
    .setType(types.TEXT);

  fields
    .newDimension()
    .setId('_created_on')
    .setName('Created On')
    .setType(types.YEAR_MONTH_DAY_HOUR);

  fields
    .newDimension()
    .setId('_modified_on')
    .setName('Modified On')
    .setType(types.YEAR_MONTH_DAY_HOUR);

  fields
    .newDimension()
    .setId('_exited_on')
    .setName('Exited On')
    .setType(types.YEAR_MONTH_DAY_HOUR);

  fields
    .newDimension()
    .setId('_exit_type')
    .setName('Exit Type')
    .setType(types.TEXT);

  fields
    .newDimension()
    .setId('_responded')
    .setName('Responded')
    .setType(types.BOOLEAN);

  for (var i = 0; i < results[0].results.length; i++) {
    var result = results[0].results[i];
    fields
      .newDimension()
      .setId(result.key + '_value')
      .setName(result.name + ' - Value')
      .setType(types.TEXT);

    fields
      .newDimension()
      .setId(result.key + '_category')
      .setName(result.name + ' - Category')
      .setType(types.TEXT);
  }

  fields.setDefaultDimension(urn.getId());

  return fields;
}

// fetch the schema for our flow
function getSchema(request) {
  var fields = getFields(request);
  fields = fields.build();
  return {schema: fields};
}

// converts the passed in value to a valid types.YEAR_MONTH_DAY_HOUR (null is returned as "")
function toDate(val) {
  if (val == null) {
    return '';
  }

  var date = new Date(val);
  return (
    date.getUTCFullYear() +
    ('0' + (date.getUTCMonth() + 1)).slice(-2) +
    ('0' + date.getUTCDate()).slice(-2) +
    ('0' + date.getUTCHours()).slice(-2)
  );
}

// converts the passed in value to a string (null is returned as "")
function toString(val) {
  if (val == null) {
    return '';
  }
  return '' + val;
}

// takes a full RapidPro result and parses it down to just the requested fields in a Data Studio format
function resultsToRows(requestedFields, results) {
  return results.map(function(result) {
    var row = [];
    requestedFields.asArray().forEach(function(field) {
      var id = field.getId();

      if (id == '_contact_name') {
        row.push(toString(result.contact.name));
      } else if (id == '_contact_urn') {
        row.push(toString(result.contact.urn));
      } else if (id == '_contact_uuid') {
        row.push(result.contact.uuid);
      } else if (id == '_created_on') {
        row.push(toDate(result.created_on));
      } else if (id == '_exited_on') {
        row.push(toDate(result.exited_on));
      } else if (id == '_exit_type') {
        row.push(toString(result.exit_type));
      } else if (id == '_modified_on') {
        row.push(toDate(result.modified_on));
      } else if (id == '_responded') {
        row.push(result.responded);
      } else {
        var isValue = true;
        if (id.endsWith('_value')) {
          id = id.substr(0, id.length - 6);
        } else if (id.endsWith('_category')) {
          id = id.substr(0, id.length - 9);
          isValue = false;
        }

        if (id in result.values) {
          if (isValue) {
            row.push(result.values[id].value);
          } else {
            row.push(result.values[id].category);
          }
        } else {
          row.push('');
        }
      }
    });
    return {values: row};
  });
}

// fetches the next page of results, using the next URL if passed in
function fetchPage(configParams, requestedFields, next) {
  var url =
    getBaseURL(configParams) +
    '/api/v2/runs.json?flow=' +
    configParams.flow_uuid;
  if (next != null) {
    url = next;
  }
  var options = {
    contentType: 'application/json',
    headers: {
      Authorization: 'Token ' + configParams.api_token
    }
  };
  var response = UrlFetchApp.fetch(url, options);
  var responseJSON = JSON.parse(response);
  var rows = resultsToRows(requestedFields, responseJSON.results);
  return {
    rows: rows,
    next: responseJSON.next
  };
}

// returns all the data for the passed in connector
function getData(request) {
  var cc = DataStudioApp.createCommunityConnector();
  var requestedFields = getFields(request).forIds(
    request.fields.map(function(field) {
      return field.name;
    })
  );

  var page = fetchPage(request.configParams, requestedFields, null);
  var rows = page.rows;
  while (page.next) {
    page = fetchPage(request.configParams, requestedFields, page.next);
    rows = rows.concat(page.rows);
  }

  return {
    schema: requestedFields.build(),
    rows: rows
  };
}

// shows the passed in error message to the user
function showError(message) {
  var cc = DataStudioApp.createCommunityConnector();
  cc.newUserError()
    .setText(message)
    .throwException();
}
