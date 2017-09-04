# ![Logo](admin/bmw.png)

[![NPM version](http://img.shields.io/npm/v/iobroker.bmw.svg)](https://www.npmjs.com/package/iobroker.bmw)
[![Downloads](https://img.shields.io/npm/dm/iobroker.bmw.svg)](https://www.npmjs.com/package/iobroker.bmw)
**Tests:** Linux/Mac: [![Travis-CI](http://img.shields.io/travis/frankjoke/iobroker.bmw/master.svg)](https://travis-ci.org/frankjoke/iobroker.bmw)
Windows: [![AppVeyor](https://ci.appveyor.com/api/projects/status/github/frankjoke/iobroker.bmw?branch=master&svg=true)](https://ci.appveyor.com/project/frankjoke/ioBroker-bmw/)

[![NPM](https://nodei.co/npm/iobroker.bmw.png?downloads=true)](https://nodei.co/npm/iobroker.bmw/)

==============

## ioBroker bmw Adapter zum Auslesen von ConnectedDrive-Daten
Der Adapter versucht die ConnectedDrive-Daten für die auf die angegebenen Benutzer registrierten Fahrzeuge.
Man kann filtern welche Daten angezeigt werden indem man im Admin die Einstellungen für
* zu verwendete services (ich verwende nur: efficiency, dynamic, navigation)
* zu löschende Einträge (Bei mir Daten wie: modelType, series, basicType, brand, licensePlate, hasNavi, bodyType, dcOnly, hasSunRoof, hasRex, steering, driveTrain, doorCount, vehicleTracking, isoCountryCode, auxPowerRegular, auxPowerEcoPro, auxPowerEcoProPlus, ccmMessages)
* Einträge die von Arrays umgewandelt werden sollen (bei mir: lastTripList|name|lastTrip|unit, specs|key|value, service|name|services, cdpFeatures|name|status, cbsMessages|text|date, lifeTimeList|name|value, characteristicList|characteristic|quantity)
* Einträge die in ihrer Hirarchie nach oben wandern sollen (bei mir attributesMap, vehicleMessages, cbsMessages, twoTimeTimer, characteristicList, lifeTimeList, lastTripList)
* der zu verwendete Datenserver kann auch angegeben werden, der Default ist für den Rest der Welt, wer in anderen Regionen wohnt kann auch <https://b2vapi.bmwgroup.cn:8592> für China, <https://b2vapi.bmwgroup.us> für USA und <https://b2vapi.bmwgroup.com> für Europe / Rest of World probieren. www.bmw-connecteddrive.com wird auf den letzten weitergeleitet.
* Es kann angegeben werden ob alle alten Objekte bei einem Adapterneustart gelöscht werden sollen.  

Wenn der Adapter die Position vom Navigationssystem auslesen kann übersetz er diese mit Hilfe von Google auf eine Adresse und gibt diese unter navigation.formatted_address an.

### p.s.: Ich möchte <https://github.com/Lyve1981/BMW-ConnectedDrive-JSON-Wrapper> und <https://github.com/edent/BMW-i-Remote> für die Beispiele danken mittels derer ich dann den Zugriff programmieren konnte!

## Important/Wichtig
* Adapter requires node >= v4.3.*!

## Changelog
### 0.2.2
* Multiple cars did not work - resolved
* Flag to delete all car data on adapter start included

### 0.2.1
* Small changes to the text and description as well as for npm

### 0.2.0
* First public release, working fine for my car!

## Install

Installieren über ioBroker.admin

## Configuration

Der Benutzername, das Passwort und die Datenfilter müssen in Adapter config eingegeben werden.

### Todo for later revisions
* Sprachunterstützung/übersetzung
* Unterstützung der Units
* Aktionen (Türen schließen, Klima anstellen, Abfahrt einstellen) durchführen

## Installation

Mit admin, iobroker oder von <https://github.com/frankjoke/iobroker.bmw> oder mit npm install iobroker.bmw

## License

The MIT License (MIT)

Copyright (c) 2014-2016, bluefox <dogafox@gmail.com>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
