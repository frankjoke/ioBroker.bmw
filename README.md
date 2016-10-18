![Logo](admin/rpi-gpio.png)
ioBroker rpi-gpio Adapter für Raspberyy Pi
==============

# Use RaspBeryy GPIO pins directly in ioBroker

Mit diesem Adapter kann man die GPIO-Pins am Raspberry Pi ansteuern (natürlich nur wenn der Adapter auf dem Raspi läuft).



## Changelog
### 0.1.0
* Ok, my first working version in both directions!

## Install

```add with iobroker Admin  Adapter the git repo```

## Configuration

Jeder Pin bekommt einen Namen und wird als Ausgang oder Eingang definiert ('output' oder 'input'  bzw 'o' oder 'i' ins Feld schreiben).
Wenn man den BCM-Mode wählt dann ist die Pin-Nummer nach BCM einzugeben, sonst ist der Pin die HW-Pin-Nummer.
Auf dem Raspi kann man (zumindest unter neuerem Jessie Betriebssystem) mit 'gpio readall' die Pin-Konfiguration anzeigen lassen.

### Todo
Nicht gebrauchte states löschen. 
Eingabe der Pins und Aus/Eingänge einschränken/verbessern 
SPI oder/und I2C support

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
