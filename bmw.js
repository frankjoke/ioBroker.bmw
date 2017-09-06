/**
 *      iobroker bmw Adapter
 *      (c) 2016- <frankjoke@hotmail.com>
 *      MIT License
 */
// jshint node:true, esversion:6, strict:global, undef:true, unused:true
"use strict";
const utils = require('./lib/utils'); // Get common adapter utils
const adapter = utils.adapter('bmw');
const MyAdapter = require('./myAdapter');
const BMWConnectedDrive = require('./connectedDrive');

const A = new MyAdapter(adapter);
const bmw = new BMWConnectedDrive(A);

adapter.on('message', obj => A.processMessage(obj));
adapter.on('ready', () => A.initAdapter().then(() => main()));
adapter.on('unload', () => A.stop(false));

function main() {
    function getCars() {
        let states = {};
        return bmw.requestVehicles()
            .then(() => A.series(Object.keys(bmw.vehicles), car => A.series(Object.keys(bmw.vehicles[car]), id => {
                let mcar = bmw.vehicles[car][id],
                    mid = car + '.' + id;
                A.D(`${mid}: ${mcar}`);
                states[mid] = true;
                return A.makeState(mid, mcar, true);
            }, 10)))
            .then(() => A.getObjectList({ // this check object list for old objects not transmitted anymore
                startkey: A.ain,
                endkey: A.ain + '\u9999'
            }))
            .then(res => A.series(res.rows, item => states[item.id.slice(A.ain.length)] ? A.res() :
                A.D(`Delete unneeded state ${A.O(item)}`, A.removeState(item.id.slice(A.ain.length))), 2))
            .catch(err => A.W(`Error in GetCars : ${err}`));
    }

    if (!adapter.config.scandelay || parseInt(adapter.config.scandelay) < 5)
        A.W(`BMW Adapter scan delay was ${adapter.config.scandelay} set to 5 min!`, adapter.config.scandelay = 5);
    A.scanDelay = parseInt(adapter.config.scandelay) * 60 * 1000; // minutes

    adapter.config.server = A.T(adapter.config.server) == 'string' && adapter.config.server.length > 10 ? adapter.config.server : 'www.bmw-connecteddrive.com';

    A.I(`BMW will look for the services ${adapter.config.services}.`);

    A.wait(100) // just wait a bit to give other background a chance to complete as well.
        .then(() => bmw.initialize(adapter.config))
        .then(() => getCars(A.scanTimer = setInterval(getCars, A.scanDelay)))
        .catch(err => {
            A.W(`BMW initialization finished with error ${A.O(err)}, will stop adapter!`);
            A.stop(true);
            throw err;
        }).then(() => A.I(`BMW Adapter initialization finished, will scan ConnectedDrive every ${adapter.config.scandelay} minutes.`));
}