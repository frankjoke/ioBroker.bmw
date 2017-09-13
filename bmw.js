/**
 *      iobroker bmw Adapter
 *      (c) 2016- <frankjoke@hotmail.com>
 *      MIT License
 */
// jshint node:true, esversion:6 strict:global, undef:true, unused:true
"use strict";
const utils = require('./lib/utils'); // Get common adapter utils
const adapter = utils.adapter('bmw');
const A = require('./myAdapter');
const BMWConnectedDrive = require('./connectedDrive');

const bmw = new BMWConnectedDrive(A.init(adapter, main));

const refresh = '_RefreshData';

let progress = false;

A.stateChange = function (id, state) {
    if (!state || state && state.ack)
        return; // no action, we act only on a command (ack = false)
    if (id == A.ain + refresh)
        return A.D(`Command to refresh data received from ${state.from}${progress? ', will not be executed because other request is in progress!' : ''}`,
            progress || getCars());
    return A.getObject(id)
        .then(obj =>
            obj && obj.native && obj.native.command ?
            bmw.executeService(id, obj.native.command) : null)
        .catch(e => A.W(`stateChange Error ${e}!`));
};

function getCars() {
    let states = {};
    if (progress)
        return Promise.resolve();
    progress = true; // don't run if progress is on!
    states[refresh] = true; // don't delete the refresh state!!!
    return bmw.requestVehicles()
        .then(() => A.seriesIn(bmw.vehicles, car => A.seriesIn(bmw.vehicles[car], id => {
            let mcar = bmw.vehicles[car][id],
                mid = car + '.' + id;
            A.D(`${mid}: ${mcar}`);
            if (id.startsWith(bmw.remStart)) {
                let sid = id.slice(bmw.remStart.length),
                    st = {
                        id: car + '.' + sid,
                        name: sid,
                        write: true,
                        role: 'button',
                        type: 'string',
                        native: {
                            command: mcar
                        }
                    };
                mid = st;
                states[st.id] = true;
                mcar = bmw.translate('NOT_STARTED');
            } else {
                states[mid] = true;
                if (mid.endsWith('.google_maps_link'))
                    mid = {
                        id: mid,
                        name: mid,
                        write: true,
                        role: 'text.url',
                        type: 'string',
                    };
            }
            return A.makeState(mid, mcar, true);
        }, 10)))
        .then(() => A.getObjectList({ // this check object list for old objects not transmitted anymore
            startkey: A.ain,
            endkey: A.ain + '\u9999'
        }))
        .then(res => A.seriesOf(res.rows, item => states[item.id.slice(A.ain.length)] ? Promise.resolve() :
            A.D(`Delete unneeded state ${A.O(item)}`, A.removeState(item.id.slice(A.ain.length))), 2))
        .catch(err => A.W(`Error in GetCars, most probably the server is down! No data is changed:  ${err}`))
        .then(() => progress = false);
}

function main() {
    if (!adapter.config.scandelay || parseInt(adapter.config.scandelay) < 5)
        A.W(`BMW Adapter scan delay was ${adapter.config.scandelay} set to 5 min!`, adapter.config.scandelay = 5);
    A.scanDelay = parseInt(adapter.config.scandelay) * 60 * 1000; // minutes

    adapter.config.server = A.T(adapter.config.server) == 'string' && adapter.config.server.length > 10 ? adapter.config.server : 'www.bmw-connecteddrive.com';

    if ((A.debug = adapter.log.level == 'debug' || adapter.config.services.startsWith('debug!')))
        A.D(`Adapter will run in debug mode because 'debug!' flag as first letters in services!`, 
            adapter.config.services = adapter.config.services.startsWith('debug!') ? 
                adapter.config.services.slice(6) 
                : adapter.config.services);

    A.I(`BMW will scan the following services: ${adapter.config.services}.`);

    A.wait(100) // just wait a bit to give other background a chance to complete as well.
        .then(() => bmw.initialize(adapter.config))
        .then(() => A.makeState({
            id: refresh,
            'write': true,
            role: 'button',
            type: typeof true
        }, false))
        .then(() => getCars(A.scanTimer = setInterval(getCars, A.scanDelay)))
        .then(() => A.I(`BMW Adapter initialization finished, will scan ConnectedDrive every ${adapter.config.scandelay} minutes.`),
            err => A.W(`BMW initialization finished with error ${err}, will stop adapter!`, A.stop(true)));
}