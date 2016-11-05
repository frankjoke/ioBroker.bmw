![Logo](admin/radar.png)
ioBroker radar für IP und Bluetooth Adapter
==============

# ioBroker radar Adapter für IP und Bluetooth
Mit diesem Adapter kann man testen ob Geräte via Netzwerk oder Bluetooth verfügbar sind.
Er benutzt Ping (und wenn installiert auch fping).
Für Bluetooth verwendet es neben Noble [http://www.nirsoft.net/utils/bluetooth_viewer.html] unter Windows und hcitool auf Linux.

Will try to use on Windows [http://www.nirsoft.net/utils/bluetooth_viewer.html], let's see

Wenn ein Name mit '-' endet wird er nicht zu whoHere dazugerechnet, erscheint aber unter allHere.
Wenn ein Gerät eine IP-Adresse hat und der Name mit 'HP-' beginnt wird versucht alle 500 scans (einstellbar) den Tiuntenfüllstand vom HP-Drucker auszulesen. 

## Changelog
### 0.4.1 
* Habe für Windows 'Bluetoothview' integriert. Damit ist es auch ohne Noble möglich BT-Devices zu scannen.
* BT LE (wie G-Tags) funktionieren leider nicht damit. Unter Umständen muss das Gerät 'gekoppelt' werden.

### 0.3.3
* Es werden nur die Objekte erzeugt welche IP oder BT-Adressen haben.
* Der code verwendet jetzt Promises woimmer möglich und die Verwendung/Abhängigkeit von den Modulen 'request' und 'async' wurde eliminiert. 
* Der Adapter startet nun auch wenn Noble nicht voll installiert ist, die Noble-BT-LE Scans sind dann einfach nicht vorhanden. 

### 0.2.1
* Implementierung von anyBelow10 wo angezeigt wird ob im Drucker irgendeine Farbe auf/unter 10% Füllstand ist.
* Implementierung von Ausschluß aus whoHere wenn Name mit `-` endet

### 0.2.0
* First public release, working fine on Raspberry

### 0.1.0
* Ok, my first working version on Raspberry!

## Install

```add with iobroker Admin  Adapter the git repo```

On Linux install `fping` (with me it worked like `sudo apt-get install fping`)

if `fping` is available the tool will use ping and fping to check on IP availabilit. 

Also make sure that `hcitool` is installed, normally part of `bluez`.

## Configuration

Jedes Gerät bekommt einen Namen und es wird entweder wird als Ausgang oder Eingang definiert ('output' oder 'input'  bzw 'o' oder 'i' ins Feld schreiben).
Beginnt der Name des Geätes mit `HP-` dann nimmt radar an es handelt sich um einen HP-Drucker und es versucht auch (alle 500 scan-Versuche) den Tintenstand auszulesen!

Wenn ein Gerätename mit `-` endet (z.B. `Internet-`) dann wird er nicht in whoHere/countHere gelistet. Damit können Geräte oder andere Devices vom Anwesenheitscheck ausgeklammert werden.

### Todo
Nicht gebrauchte states löschen. 
Auf Windows mit Bluetooth eine 2. Alternative zu Noble (Benutzt nur BT-LE) suchen.

## Installation
Auf Linux sollte das tool 'fping' (z.B. mit `sudo apt-get install fping`) installiert werden welches zusätzlich zum normalen ping verwendet wird.

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
