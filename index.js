import fetch from 'node-fetch'; 
import { stringify } from 'querystring';
import { dump } from 'js-yaml';

// -----------------------------------------------------------------------------
//
// sg108e-mgmt: a set of node routines to manage a TP Link SG108E switch
//
// A TP Link SG108E provides a Web-UI which allows to control the behaviour of
// the switch. This repo makes use of that Web-UI to allow for programmatic
// automation for following operations:
//
// Info:      returns configuration & status of the switch, ports and vlans 
// SetSwitch: sets name of switch and enables/diasables 802.1Q vlans
// SetPort:   sets state and speed of a port
// SetVLAN:   sets or deletes id, name and configuration of a vlan
// Diagnosis: check connectivity and credentials
//
// Common connection parameters:
//   server:   hostname or IP address of the switch
//   username: username for the WebUI (default: admin)
//   password: password for the WebUI (default: admin)
//
// The routines only cover a subset of the capabilities of the switch.
// Specificially the VLANs only make use 802.1Q VLANs and no QoS configuration.
// Each of the routines follows the same structure:
//   - validate parameters
//   - login to the switch
//   - read the current status
//   - modify the configuration
//   - check the results
//   - logout
//   - present the results
//
// It has to be mentioned that the management of the switch is not very secure
// since the API only makes use of http and during a session any other client 
// could access the Web-UI and potentially modify the configuration.
//
// Sample output of Info:
//     switch:
//       hardware: TL-SG108E 3.0
//       fimrware: 1.0.0 Build 20171214 Rel.70905
//       name: Switch-007
//       mac: '70:4F:57:35:BE:36'
//       ip: 192.168.178.101
//       netmask: 255.255.0.0
//       gateway: 192.168.178.1
//       vlan: Enabled
//       ports:
//         - number: 1
//           state: Enabled
//           speed: down
//           link: down
//           TxGoodPkt: 0
//           TxBadPkt: 0
//           RxGoodPkt: 0
//           RxBadPkt: 0
//         - number: 2
//           state: Enabled
//           speed: down
//           link: down
//           TxGoodPkt: 0
//           TxBadPkt: 0
//           RxGoodPkt: 0
//           RxBadPkt: 0
//         - number: 3
//           state: Enabled
//           speed: down
//           link: down
//           TxGoodPkt: 0
//           TxBadPkt: 0
//           RxGoodPkt: 0
//           RxBadPkt: 0
//         - number: 4
//           state: Disabled
//           speed: down
//           link: down
//           TxGoodPkt: 0
//           TxBadPkt: 0
//           RxGoodPkt: 0
//           RxBadPkt: 0
//         - number: 5
//           state: Enabled
//           speed: down
//           link: down
//           TxGoodPkt: 0
//           TxBadPkt: 0
//           RxGoodPkt: 0
//           RxBadPkt: 0
//         - number: 6
//           state: Enabled
//           speed: down
//           link: down
//           TxGoodPkt: 0
//           TxBadPkt: 0
//           RxGoodPkt: 0
//           RxBadPkt: 0
//         - number: 7
//           state: Enabled
//           speed: down
//           link: down
//           TxGoodPkt: 0
//           TxBadPkt: 0
//           RxGoodPkt: 0
//           RxBadPkt: 0
//         - number: 8
//           state: Enabled
//           speed: 100MF
//           link: 100MF
//           TxGoodPkt: 4318
//           TxBadPkt: 0
//           RxGoodPkt: 58799
//           RxBadPkt: 0
//       vlans:
//         - name: Default
//           id: 1
//           tagged: []
//           untagged: [1,2,3,4,5,6,7,8]
//         - name: alpha
//           id: 3
//           tagged: [2,4,6,8]
//           untagged: []
//         - name: Test
//           id: 7
//           tagged: [3,4]
//           untagged: []
//
// Author: bernard@tsai.eu
//
// --- CONSTANTS ---------------------------------------------------------------

const LOGIN_PATH       = ':80/logon.cgi';
const LOGOUT_PATH      = ':80/Logout.htm';
const SWITCH_INFO_PATH = ':80/SystemInfoRpm.htm';
const PORT_INFO_1_PATH = ':80/PortSettingRpm.htm';
const PORT_INFO_2_PATH = ':80/PortStatisticsRpm.htm';
const VLAN_INFO_PATH   = ':80/Vlan8021QRpm.htm';
const SWITCH_PATH      = ':80/system_name_set.cgi';
const VLAN_PATH        = ':80/qvlanSet.cgi';
const PORT_PATH        = ':80/port_setting.cgi';

const SPEEDS = ['down', 'Auto', '10MH', '10MF', '100MH', '100MF', '1000MF', ''];
const SPEED2VALUE = {
  'down'   : 0, 
  'Auto'   : 1, 
  '10MH'   : 2, 
  '10MF'   : 3, 
  '100MH'  : 4, 
  '100MF'  : 5, 
  '1000MF' : 6, 
  ''       : 7
};
const STATES = ['Disabled', 'Enabled'];

// --- DIAGNOSIS ---------------------------------------------------------------
//
// Diagnosis: returns configuration & status of the switch, ports and vlans
//   server:   hostname or IP address of the switch
//   username: username for the WebUI (default: admin)
//   password: password for the WebUI (default: admin)
// returns:
//   data object with switch, port and vlan information or
//   {} in case an error occured
// 
async function Diagnosis(server, username, password) {
  // initially no connectivity is assumed
  let connection_state = 'not accessible';

  try {
    // -- LOGIN ---
    const url1 = 'http://' + server + LOGIN_PATH;

    // form data to be sent 
    const formData = stringify({
      username: username,
      password: password,
      logon:   'Login'
    });

    // send request
    await fetch(url1, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length2': formData.length
      },
      body: formData,
      signal: AbortSignal.timeout(1000)
    });

    // connectivity is given but authorization may have failed
    connection_state = 'not authorized';

    // --- SWITCH INFO ---
    const url2 = 'http://' + server + SWITCH_INFO_PATH;

    // execute query
    const response2 = await fetch(url2)

    const status2 = response2.status;

    // connectivity is given but authorization may have failed
    if (status2 == 200) {
      connection_state = 'authorized';
    }
    
    // --- LOGOUT ---
    const url3 = 'http://' + server + LOGOUT_PATH;

    // send the request
    await fetch(url3)
  } catch (error) {
    if (error.name !== 'AbortError') {
      console.error('Error running diagnosis:', error);
      process.exit(1);
    }
  }

  // returns the achieved connection state
  return connection_state;
}

// --- INFO --------------------------------------------------------------------
//
// Info: check connectivity and credentials
//   server:   hostname or IP address of the switch
//   username: username for the WebUI (default: admin)
//   password: password for the WebUI (default: admin)
// returns:
//   not accessible: connectivity is not given
//   not authorized: connectivity is given but credentials are invalid
//   authorized:     connectivity is given and credentials are valid
// 
async function Info(server, username, password) {
  let result = {};

  await _login(server, username, password)

  result = await _switchInfo(server)

  await _logout(server)

  return result
}

// --- SETSWITCH ---------------------------------------------------------------
//
// SetSwitch: sets name of switch and enables/diasables 802.1Q vlans
//   server:   hostname or IP address of the switch
//   username: username for the WebUI (default: admin)
//   password: password for the WebUI (default: admin)
//   name:     name of switch
//   vlan:     0/1 to disable/enable 802.1Q vlans
// returns:
//   nothing but may throw an error
// 
// Routine uses following two GET requests to set name and mode
//     http://<SERVER:80>/system_name_set.cgi?sysName=<NAME>
//     http://<SERVER:80>/qvlanSet.cgi?qvlan_en=<VLAN>&qvlan_mode=Apply
async function SetSwitch(server, username, password, name, vlan) {
  const regex = /^[a-zA-Z0-9-_]+$/;

  // login
  await _login(server, username, password)

  // adjust name of switch
  if (name && name !== '' && name.length < 32 || regex.test(name)) {
    const url1 = 'http://' + server + SWITCH_PATH + '?sysName=' + name;

    await fetch(url1);
  }

  // adjust VLAN mode
  if (vlan && (vlan === 0 || vlan === 1)) {
    const url2 = 'http://' + server + VLAN_PATH + '?qvlan_en=' + vlan + '&qvlan_mode=Apply';

    await fetch(url2);
  }

  // logout
  await _logout(server)
}

// --- SETPORT -----------------------------------------------------------------
//
// SetPort: sets state and speed of a port
//   server:   hostname or IP address of the switch
//   username: username for the WebUI (default: admin)
//   password: password for the WebUI (default: admin)
//   port:     port index (1-8)
//   state:    0/1 to disable/enable port
//   speed:    'Auto', '10MH', '10MF', '100MH', '100MF', '1000MF'
// returns:
//   nothing but may throw an error
// 
// Routine uses following GET request to set port state and speed
//     http://<SERVER:80>/port_setting.cgi?portid=3&state=<STATE>&speed=<SPEED>&flowcontrol=0&apply=Apply

async function SetPort(server, username, password, port, state, speed) {
  // login
  await _login(server, username, password)

  // check parameters
  const portIndex  = parseInt(port)
  const mode       = parseInt(state)
  const speedIndex = SPEED2VALUE[speed]

  if (1 <= portIndex && portIndex <= 8 && (mode === 0 || mode === 1)  &&  speedIndex) {
    const url = 'http://' + server + PORT_PATH + '?portid=' + portIndex + '&state=' + mode + '&speed=' + speedIndex + '&flowcontrol=0&apply=Apply';

    await fetch(url);
  }

  // logout
  await _logout(server)
}

// --- SETVLAN -----------------------------------------------------------------
//
// SetVLAN: sets or deletes id, name and configuration of a vlan
//   server:   hostname or IP address of the switch
//   username: username for the WebUI (default: admin)
//   password: password for the WebUI (default: admin)
//   vlan:     VLAN index (2-32) - 1 is reserved for port VLAN ID
//   name:     name of VLAN
//   members:  list of ports which are to be members of the VLAN 
// returns:
//   nothing but may throw an error
// 
// Routine uses following GET request to set port state and speed
//     http://<SERVER>:80/qvlanSet.cgi?vid=<VLAN>&vname=<NAME>&selType_1=<?>&selType_2=<?>&selType_3=<?>&selType_4=<?>&selType_5=<?>&selType_6=<?>&selType_7=<?>&selType_8=<?>&qvlan_add=Add%2FModify
//     http://<SERVER>:80/qvlanSet.cgi?selVlans=<VLAN>&qvlan_del=Delete
//
async function SetVLAN(server, username, password, vlan, name, members) {
  const regex = /^[a-zA-Z0-9-_]+$/;

  // login
  await _login(server, username, password)

  // check parameters
  const vlanIndex = parseInt(vlan)

  if (2 <= vlanIndex && vlanIndex <= 32 && name && name != '' && regex.test(name) && Array.isArray(members) ) {
    // need to delete or add/modify
    if (members.length === 0 ) {
      // delete VLAN
      const url1 = 'http://' + server + VLAN_PATH + '?selVlans=' + vlanIndex + '&qvlan_del=Delete';

      await fetch(url1);
    } else {
      // add/modify VLAN
      let url2 = 'http://' + server + VLAN_PATH + '?vid=' + vlanIndex + '&vname=' + name;
      url2 += '&selType_1=' + (members.includes(1) ? 1 : 2);
      url2 += '&selType_2=' + (members.includes(2) ? 1 : 2);
      url2 += '&selType_3=' + (members.includes(3) ? 1 : 2);
      url2 += '&selType_4=' + (members.includes(4) ? 1 : 2);
      url2 += '&selType_5=' + (members.includes(5) ? 1 : 2);
      url2 += '&selType_6=' + (members.includes(6) ? 1 : 2);
      url2 += '&selType_7=' + (members.includes(7) ? 1 : 2);
      url2 += '&selType_8=' + (members.includes(8) ? 1 : 2);
      url2 += '&qvlan_add=Add%2FModify';
      console.log(url2);
      await fetch(url2);
    }
  }

  // logout
  await _logout(server)
}

// --- _LOGIN ------------------------------------------------------------------
//
// _login: authenticates against the Web UI
//   server:   hostname or IP address of the switch
//   username: username for the WebUI (default: admin)
//   password: password for the WebUI (default: admin)
// returns:
//   nothing but may throw an error
//
async function _login(server, username, password) {
  const url = 'http://' + server + LOGIN_PATH;

  // form data to be sent 
  const formData = stringify({
    username: username,
    password: password,
    logon:   'Login'
  });

  // post the form data
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length2': formData.length
    },
    body: formData
  });
}

// --- _LOGOUT -----------------------------------------------------------------
//
// _logout: logs off from the Web UI
//   server:   hostname or IP address of the switch
// returns:
//   nothing but may throw an error
//
async function _logout(server) {
  const url = 'http://' + server + LOGOUT_PATH;

  // post the form data
  await fetch(url)
}

// --- _SWITCHINFO ------------------------------------------------------------------
//
// _switchInfo: reads configuration & status of the switch, ports and vlans 
//   server:   hostname or IP address of the switch
// returns:
//   a data object with switch, port and vlan information
//   but may throw an error
//
// The routine analyses the first script of the web response:
//     var info_ds = {
//       descriStr: [
//         "TL-SG108E"
//       ],
//       macStr: [
//         "70:4F:57:6B:94:AE"
//       ],
//       ipStr: [
//         "192.168.0.1"
//       ],
//       netmaskStr: [
//         "255.255.255.0"
//       ],
//       gatewayStr: [
//         "0.0.0.0"
//       ],
//       firmwareStr: [
//         "1.0.0 Build 20171214 Rel.70905"
//       ],
//       hardwareStr: [
//         "TL-SG108E 3.0"
//       ]
//     };
//     var tip = "";
async function _switchInfo(server) {
  // the result
  const swtch = {};

  // execute query
  const url = 'http://' + server + SWITCH_INFO_PATH;

  // query the API
  const response = await fetch(url)

  const data   = await response.text();

  // parse the response
  const scrpt = extractTagContent(data, 'script', 0);

  if (scrpt) {
    swtch.hardware = stripQuotes(extractAttribute(scrpt, 'hardwareStr'));
    swtch.fimrware = stripQuotes(extractAttribute(scrpt, 'firmwareStr'));
    swtch.name     = stripQuotes(extractAttribute(scrpt, 'descriStr'));
    swtch.mac      = stripQuotes(extractAttribute(scrpt, 'macStr'));
    swtch.ip       = stripQuotes(extractAttribute(scrpt, 'ipStr'));
    swtch.netmask  = stripQuotes(extractAttribute(scrpt, 'netmaskStr'));
    swtch.gateway  = stripQuotes(extractAttribute(scrpt, 'gatewayStr'));
    swtch.vlan     = STATES[0];
    swtch.ports    = [];
    swtch.vlans    = [];
  }

  // retrieve port information
  await _portInfo1(server, swtch)
  await _portInfo2(server, swtch)
  await _vlanInfo(server, swtch)

  return {switch: swtch};
}

// --- _PORTINFO1 --------------------------------------------------------------
//
// _portInfo1: reads port information (part 1) 
//   server:   hostname or IP address of the switch
//   swtch:    switch object
// returns:
//   nothing but may throw an error
//   results are stored in swtch object
//
// The routine analyses the first script of the web response:
//     var max_port_num = 8;
//     var port_middle_num = 16;
//     var all_info = {
//       state: [1, 1, 1, 1, 1, 1, 1, 1, 0, 0],
//       trunk_info: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
//       spd_cfg: [1, 1, 1, 1, 1, 1, 1, 1, 0, 0],
//       spd_act: [6, 0, 0, 0, 0, 0, 0, 0, 0, 0],
//       fc_cfg: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
//       fc_act: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
//     };
//     var tip = "";
async function _portInfo1(server, swtch) {
  // execute query
    const url = 'http://' + server + PORT_INFO_1_PATH;

  // query the API
  const response = await fetch(url)

  const data   = await response.text();

  // parse the response
  const scrpt = extractTagContent(data, 'script', 0);

  // parse the response
  if (scrpt) {
    var ports  = parseInt(extractVariable(scrpt, 'max_port_num') );
    var states = extractAttribute(scrpt, 'state').split(',')
    var speeds = extractAttribute(scrpt, 'spd_act').split(',')

    // populate port information
    for (var portIndex = 0; portIndex < ports; portIndex++) {
      swtch.ports[portIndex]  = {};

      const port = swtch.ports[portIndex];

      port.number = portIndex + 1;
      port.state  = STATES[parseInt(states[portIndex])];
      port.speed  = SPEEDS[speeds[portIndex]];
    }

  }
}

// --- _PORTINFO2 --------------------------------------------------------------
//
// _portInfo2: reads port information (part 2) 
//   server:   hostname or IP address of the switch
//   swtch:    switch object
// returns:
//   nothing but may throw an error
//   results are stored in swtch object
//
// The routine analyses the first script of the web response:
//     var max_port_num = 8;
//     var port_middle_num = 16;
//     var all_info = {
//       state: [1, 1, 1, 1, 1, 1, 1, 1, 0, 0],
//       link_status: [6, 0, 0, 0, 0, 0, 0, 0, 0, 0],
//       pkts: [786, 0, 1080, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
//     };
//     var tip = "";
async function _portInfo2(server, swtch) {
  // execute query
  const url = 'http://' + server + PORT_INFO_2_PATH;

  // query the API
  const response = await fetch(url)

  const data = await response.text();

  // parse the response
  const scrpt = extractTagContent(data, 'script', 0);

  // parse the response
  if (scrpt) {
    var ports = parseInt(extractVariable(scrpt, 'max_port_num'));
    var links = extractAttribute(scrpt, 'link_status').split(',')
    var pkts  = extractAttribute(scrpt, 'pkts').split(',')

    // populate port information
    for (var portIndex = 0; portIndex < ports; portIndex++) {
      const port     = swtch.ports[portIndex];

      port.link      = SPEEDS[links[portIndex]];
      port.TxGoodPkt = parseInt(pkts[4 * portIndex + 0]);
      port.TxBadPkt  = parseInt(pkts[4 * portIndex + 1]);
      port.RxGoodPkt = parseInt(pkts[4 * portIndex + 2]);
      port.RxBadPkt  = parseInt(pkts[4 * portIndex + 3]);
    }
  }
}

// --- _VLANINFO ---------------------------------------------------------------
//
// _vlanInfo: reads vlan information
//   server:   hostname or IP address of the switch
//   swtch:    switch object
// returns:
//   nothing but may throw an error
//   results are stored in swtch object
//
// The routine analyses the first script of the web response:
//     var qvlan_ds = {
//       state: 1,
//       portNum: 8,
//       vids: [
//         1, 2, 3, 4, 5
//       ],
//       count: 5,
//       maxVids: 32,
//       names: [
//         'Default', '', '', '', ''
//       ],
//       tagMbrs: [
//         0x0, 0x0, 0x0, 0x0, 0x0
//       ],
//       untagMbrs: [
//         0xFF, 0xAA, 0x24, 0x88, 0x1F
//       ],
//       lagIds: [
//         0, 0, 0, 0, 0, 0, 0, 0
//       ],
//       lagMbrs: [
//         0, 0x0, 0x0
//       ]
//     }; 
//     var tip = "";
async function _vlanInfo(server, swtch) {
  // execute query
  const url = 'http://' + server + VLAN_INFO_PATH;

  // query the API
  const response = await fetch(url)

  const data = await response.text();

  // parse the response
  const scrpt = extractTagContent(data, 'script', 0);

  // parse the response
  if (scrpt) {
    swtch.vlan = STATES[parseInt(extractAttribute(scrpt, 'state'))];

    var vlans = parseInt(extractAttribute(scrpt, 'count'));
    var vids  = extractAttribute(scrpt, 'vids').split(',');
    var names = extractAttribute(scrpt, 'names').split(',');
    var tag   = extractAttribute(scrpt, 'tagMbrs').split(',');
    var untag = extractAttribute(scrpt, 'untagMbrs').split(',');

    // populate port information
    for (var vlanIndex = 0; vlanIndex < vlans; vlanIndex++) {
      swtch.vlans[vlanIndex] = {};

      const vlan    = swtch.vlans[vlanIndex];
      vlan.name     = stripQuotes(names[vlanIndex]);
      vlan.id       = parseInt(vids[vlanIndex]);

      // add tagged port members
      vlan.tagged = []
      const tagged_value = parseInt(tag[vlanIndex], 16);
      for (let portIndex = 0; portIndex < 16; portIndex++) {
        // Use bitwise AND to check if the bit is set 
        const isBitSet = (tagged_value & (1 << portIndex)) !== 0;     
        
        if (isBitSet) {
          vlan.tagged.push(portIndex +1)
        }
      }

      // add tagged port members
      vlan.untagged = []
      const untagged_value = parseInt(untag[vlanIndex], 16);
      for (let portIndex = 0; portIndex < 16; portIndex++) {
        // Use bitwise AND to check if the bit is set 
        const isBitSet = (untagged_value & (1 << portIndex)) !== 0;

        if (isBitSet) {
          vlan.untagged.push(portIndex + 1)
        }
      }
    }
  }
}

// --- EXTRACTTAGCONTENT -------------------------------------------------------
//
// extractTagContent: extracts content between two html tags (n-th occurence)
//   txt:   text to parse
//   tag:   tag identifier
//   n:     index of occurence
// returns:
//   extracted content but may throw an error
//
function extractTagContent(txt, tag, n) {
  // construct regular expression
  const openTag    = '<' + tag + '>' 
  const content    = '([\\s\\S]*?)'
  const closeTag   = '<\\/' + tag + '>'
  const expression = openTag + content + closeTag
  const regex      = new RegExp(expression, 'gi')

  // match regular expression
  const matches = txt.match(regex)

  // check if a match was found
  if (!matches || matches.length <= n) {
    return null
  }

  // strip tags
  const result = matches[n].substr(openTag.length).slice(0, -closeTag.length);
  return result
}

// --- EXTRACTVARIABLE ---------------------------------------------------------
//
// extractVariable: extracts value for a variable as string
//   txt:      text to parse
//   variable: variable name
// returns:
//   extracted value but may throw an error
//
function extractVariable(txt, variable) {
  // construct regular expression
  const varStart   = variable + '\\s*='
  const content    = '([\\s\\S]*?)'
  const varEnd     = ';'
  const expression = varStart + content + varEnd
  const regex      = new RegExp(expression)

  // match regular expression
  const match = txt.match(regex)

  // check if a match was found
  if (!match) {
    return null
  }

  // trim
  const result = match[1].trim()
  return result
}

// --- EXTRACTATTRIBUTE --------------------------------------------------------
//
// extractAttribute: extracts value for a simple attribute as string
//   txt:       text to parse
//   attribute: attribute name
// returns:
//   extracted value but may throw an error
//
function extractAttribute(txt, attribute) {
  // construct regular expression
  const aString    = "'([^']*)'";
  const aBoolean   = '\\b(true|false)\\b';
  const aNumber    = '\\b(\\d+\\.?\\d?)?\\b';
  const aList      = '\\[([^\\]]*)\\]';
  const aDict      = '\\{([^}]*)\\}';
  const expression = attribute + '\\s*:\\s*' + '(?:' + aString + '|' + aBoolean + '|' + aNumber + '|' + aList + '|' + aDict + ')';
  const regex      = new RegExp(expression)

  // match regular expression
  const match = txt.match(regex)

  // check if a match was found
  if (!match) {
    return null
  }

  // trim
  for (let i = 1; i <= 5; i++) {
    if (match[i]) {
      let value = match[i].trim()
      if (i != 4 && i != 5) {
        value = stripQuotes(value)
      }
      return value
    }
  }
  return null
}

// --- STRIPQUOTES -------------------------------------------------------------
//
// stripQuotes: removes matching quotes at the begin and end of a string
//   txt:       text to trim
// returns:
//   trimmed string but may throw an error
//
function stripQuotes(txt) {
  // replace double quotes
  if ( txt.startsWith('"') && txt.endsWith('"') ) {
    let value = txt;

    value = value.replace(/^"/, '');
    value = value.replace(/"$/, '');

    return value;
  }

  // replace single quotes
  if (txt.startsWith('\'') && txt.endsWith('\'')) {
    let value = txt;

    value = value.replace(/^'/, '');
    value = value.replace(/'$/, '');

    return value;
  }

  return txt;
}

// --- TEST --------------------------------------------------------------------
// 
// test routine
//
(async () => {
  // setup parameters
  const SWITCH   = '192.168.178.101';    // ip address of switch
  const USERNAME = 'admin';              // default switch username
  const PASSWORD = 'admin';              // default switch password

  // check connectivity and credentials
  const status = await Diagnosis(SWITCH, USERNAME, PASSWORD);
  console.log("Diagnosis: " + status);

  // set switch name and turn on VLANs
  await SetSwitch( SWITCH, USERNAME, PASSWORD, 'Switch-007', 1);

  // set port state and speed
  await SetPort( SWITCH, USERNAME, PASSWORD, 4, 0, '100MH');

  // set VLAN 3 with members 2,4,6,8
  await SetVLAN( SWITCH, USERNAME, PASSWORD, 3, 'alpha', [2,4,6,8]);
  
  // get switch, port and vlan configuration and status
  const data = await Info(SWITCH, USERNAME, PASSWORD);

  console.log(dump(data));

  // delete VLAN 3 by defining no members
  await SetVLAN( SWITCH, USERNAME, PASSWORD, 3, []);
})();

// -----------------------------------------------------------------------------
