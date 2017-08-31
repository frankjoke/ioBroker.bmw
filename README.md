![Logo](admin/bmw.png)

[![NPM version](http://img.shields.io/npm/v/iobroker.bmw.svg)](https://www.npmjs.com/package/iobroker.bmw)
[![Downloads](https://img.shields.io/npm/dm/iobroker.bmw.svg)](https://www.npmjs.com/package/iobroker.bmw)
**Tests:** Linux/Mac: [![Travis-CI](http://img.shields.io/travis/frankjoke/iobroker.bmw/master.svg)](https://travis-ci.org/frankjoke/iobroker.bmw)
Windows: [![AppVeyor](https://ci.appveyor.com/api/projects/status/github/frankjoke/iobroker.bmw?branch=master&svg=true)](https://ci.appveyor.com/project/frankjoke/ioBroker-bmw/)


[![NPM](https://nodei.co/npm/iobroker.bmw.png?downloads=true)](https://nodei.co/npm/iobroker.bmw/)

==============

# ioBroker bmw Adapter Zum Auslesen von ConnectedDrive-Daten
BlaBla---

## Important/Wichtig
* Adapter requires node >= v4.3.*!

## Changelog
### 0.2.0
* First public release, working fine on Raspberry

### 0.1.0
* Ok, my first working version on Raspberry!

## Install

Installieren über ioBroker.admin

On Linux install `fping` and `arp-scan` (with me it worked like `sudo apt-get install fping arp-scan`)

if `fping` is available the tool will use ping and fping to check on IP availabilit. 
if `arp-scan` is available it will use it to scan mac addresses.

Also make sure that `hcitool` is installed, normally part of `bluez`.

## Configuration

Jedes Gerät bekommt einen Namen und es wird entweder wird als Ausgang oder Eingang definiert ('output' oder 'input'  bzw 'o' oder 'i' ins Feld schreiben).
Beginnt der Name des Geätes mit `HP-` dann nimmt bmw an es handelt sich um einen HP-Drucker und es versucht auch (alle 500 scan-Versuche) den Tintenstand auszulesen!

Wenn ein Gerätename mit `-` endet (z.B. `Internet-`) dann wird er nicht in whoHere/countHere gelistet. Damit können Geräte oder andere Devices vom Anwesenheitscheck ausgeklammert werden.

### Todo

## Installation
Auf Linux sollte das tool 'fping' und arp-scan (z.B. mit `sudo apt-get install fping arp-scan`) installiert werden welches zusätzlich zum normalen ping verwendet wird.
Auf Windows sollte das bin.zip nach node_modules\iobroker.bmw extrahiert werden da eventuell node_modules\iobroker.bmw\bin\bluetoothview\BluetoothView.exe von npm nicht installiert wird.

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
