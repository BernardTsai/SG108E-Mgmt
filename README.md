# SG108E-Mgmt

A set of node routines to manage a TP Link SG108E switch.

A TP Link SG108E provides a Web-UI which allows to control the behaviour of the switch. This repo makes use of that Web-UI to allow for programmatic automation for following operations:

 * **Info**:      returns configuration & status of the switch, ports and vlans 
 * **SetSwitch**: sets name of switch and enables/diasables 802.1Q vlans
 * **SetPort**:   sets state and speed of a port
 * **SetVLAN**:   sets or deletes id, name and configuration of a vlan
 * **Diagnosis**: check connectivity and credentials

Common connection parameters:
* **server**:   hostname or IP address of the switch
* **username**: username for the WebUI (default: admin)
* **password**: password for the WebUI (default: admin)

The routines only cover a subset of the capabilities of the switch. Specificially the VLANs only make use 802.1Q VLANs and no QoS configuration. Each of the routines follows the same structure:

  - validate parameters
  - login to the switch
  - read the current status
  - modify the configuration
  - check the results
  - logout
  - present the results

It has to be mentioned that the management of the switch is not very secure since the API only makes use of http and during a session any other client could access the Web-UI and potentially modify the configuration.

---

Sample output of **Info**:
```yaml
switch:
  hardware: TL-SG108E 3.0
  fimrware: 1.0.0 Build 20171214 Rel.70905
  name: Switch-007
  mac: '70:4F:57:35:BE:36'
  ip: 192.168.178.101
  netmask: 255.255.0.0
  gateway: 192.168.178.1
  vlan: Enabled
  ports:
    - number: 1
      state: Enabled
      speed: down
      link: down
      TxGoodPkt: 0
      TxBadPkt: 0
      RxGoodPkt: 0
      RxBadPkt: 0
    - number: 2
      state: Enabled
      speed: down
      link: down
      TxGoodPkt: 0
      TxBadPkt: 0
      RxGoodPkt: 0
      RxBadPkt: 0
    - number: 3
      state: Enabled
      speed: down
      link: down
      TxGoodPkt: 0
      TxBadPkt: 0
      RxGoodPkt: 0
      RxBadPkt: 0
    - number: 4
      state: Disabled
      speed: down
      link: down
      TxGoodPkt: 0
      TxBadPkt: 0
      RxGoodPkt: 0
      RxBadPkt: 0
    - number: 5
      state: Enabled
      speed: down
      link: down
      TxGoodPkt: 0
      TxBadPkt: 0
      RxGoodPkt: 0
      RxBadPkt: 0
    - number: 6
      state: Enabled
      speed: down
      link: down
      TxGoodPkt: 0
      TxBadPkt: 0
      RxGoodPkt: 0
      RxBadPkt: 0
    - number: 7
      state: Enabled
      speed: down
      link: down
      TxGoodPkt: 0
      TxBadPkt: 0
      RxGoodPkt: 0
      RxBadPkt: 0
    - number: 8
      state: Enabled
      speed: 100MF
      link: 100MF
      TxGoodPkt: 4318
      TxBadPkt: 0
      RxGoodPkt: 58799
      RxBadPkt: 0
  vlans:
    - name: Default
      id: 1
      tagged: []
      untagged: [1,2,3,4,5,6,7,8]
    - name: alpha
      id: 3
      tagged: [2,4,6,8]
      untagged: []
    - name: Test
      id: 7
      tagged: [3,4]
      untagged: []
```

Author: bernard@tsai.eu
