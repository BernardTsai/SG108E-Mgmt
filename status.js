import fetch from 'node-fetch'; 
import { stringify } from 'querystring';
import { dump } from 'js-yaml';

// --- PARAMETERS --------------------------------------------------------------

const PREFIX   = 'http://192.168.178.101:80/';    // url prefix of the Web API
const USERNAME = 'admin';                         // default switch username
const PASSWORD = 'admin';                         // default switch password

// -----------------------------------------------------------------------------

async function login() {
  const url = PREFIX + 'logon.cgi';

  // form data to be sent 
  const formData = stringify({
    username: USERNAME,
    password: PASSWORD,
    logon: 'Login'
  });

  try {
    // post the form data
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length2': formData.length
      },
      body: formData
    });

    const status = response.status;
  }
  catch (error) {
    console.error('Error logging in:', error);
    process.exit(1);
  } 
}

// -----------------------------------------------------------------------------

async function logout() {
  const url = PREFIX + 'Logout.htm';

  try {
    // post the form data
    const response = await fetch(url)

    const status = response.status;
  }
  catch (error) {
    console.error('Error logging out:', error);
    process.exit(1);
  }
}

// -----------------------------------------------------------------------------

async function switchInfo() {
  // the result
  const swtch = {};

  // execute query
  const url = PREFIX + 'SystemInfoRpm.htm';
  try {
    // query the API
    const response = await fetch(url)

    const data   = await response.text();
    const status = response.status;

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
      swtch.vlan     = '';
      swtch.ports    = [];
      swtch.vlans    = [];
    }

    // retrieve port information
    await portInfo1(swtch)
    await portInfo2(swtch)
    await vlanInfo1(swtch)
  }
  catch (error) {
    console.error('Error retrieving switch information:', error);
    process.exit(1);
  }

  return swtch;
}

// -----------------------------------------------------------------------------

async function portInfo1(swtch) {
  // execute query
  const url = PREFIX + 'PortSettingRpm.htm';

  try {
    // query the API
    const response = await fetch(url)

    const data   = await response.text();
    const status = response.status;

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
        port.state  = parseInt(states[portIndex]);
        port.speed  = ['', 'Auto', '10MH', '10MF', '100MH', '100MF', '1000MF', ''][speeds[portIndex]];
      }

    }
  }
  catch (error) {
    console.error('Error retrieving port information 1:', error);
    process.exit(1);
  }
}

// -----------------------------------------------------------------------------

async function portInfo2(swtch) {
  // execute query
  const url = PREFIX + 'PortStatisticsRpm.htm';

  try {
    // query the API
    const response = await fetch(url)

    const data = await response.text();
    const status = response.status;

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

        port.link      = ['down', 'Auto', '10MH', '10MF', '100MH', '100MF', '1000MF', ''][links[portIndex]];
        port.TxGoodPkt = parseInt(pkts[4 * portIndex + 0]);
        port.TxBadPkt  = parseInt(pkts[4 * portIndex + 1]);
        port.RxGoodPkt = parseInt(pkts[4 * portIndex + 2]);
        port.RxBadPkt  = parseInt(pkts[4 * portIndex + 3]);
      }
    }
  }
  catch (error) {
    console.error('Error retrieving port information 2:', error);
    process.exit(1);
  }
}

// -----------------------------------------------------------------------------

async function vlanInfo1(swtch) {
  // execute query
  const url = PREFIX + 'Vlan8021QRpm.htm';

  try {
    // query the API
    const response = await fetch(url)

    const data = await response.text();
    const status = response.status;

    // parse the response
    const scrpt = extractTagContent(data, 'script', 0);

    // parse the response
    if (scrpt) {
      swtch.vlan = parseInt(extractAttribute(scrpt, 'state'));

      var ports = parseInt(extractAttribute(scrpt, 'portNum'));
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
  catch (error) {
    console.error('Error retrieving vlan information:', error);
    process.exit(1);
  }
}

// -----------------------------------------------------------------------------
//
// extractTagContent: extracts content between two html tags (n-th occurence)
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

// -----------------------------------------------------------------------------
//
// extractVariable: extracts value for a variable as string
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

// -----------------------------------------------------------------------------
//
// extractAttribute: extracts value for a simple attribute as string
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

// -----------------------------------------------------------------------------
//
// stripQuotes: removes matching quotes at the begin and end of a string
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

// -----------------------------------------------------------------------------

(async () => {
  await login()

  const swtch = await switchInfo()

  console.log(dump({'switch': swtch}))

  await logout()
})();

// -----------------------------------------------------------------------------
