import TuyAPI from 'tuyapi';

import {
    Logging,
} from 'homebridge';

export enum CleanSpeed {
    STANDARD = 'Standard',
    BOOST_IQ = 'Boost_IQ',
    MAX = 'Max',
    NO_SUCTION = 'No_suction'
}

export enum ErrorCode {
    NO_ERROR = 'no_error',
    STUCK_5_MIN = 'Stuck_5_min',
    CRASH_BAR_STUCK = 'Crash_bar_stuck',
    SENSOR_DIRTY = 'sensor_dirty',
    NOT_ENOUGH_POWER = 'N_enough_pow',
    WHEEL_STUCK = 'Wheel_stuck',
    S_BRUSH_STUCK = 'S_brush_stuck',
    FAN_STUCK = 'Fan_stuck',
    R_BRUSH_STUCK = 'R_brush_stuck'
}

export enum WorkStatus {
    // Cleaning
    RUNNING = 'Running',
    // Not in the dock, paused
    STAND_BY = 'standby',
    // Not in the dock - goes into this state after being paused for a while
    SLEEPING = 'Sleeping',
    // In the dock, charging
    CHARGING = 'Charging',
    // In the dock, full charged
    COMPLETED = 'completed',
    // Going home because battery is depleted or home was pressed
    RECHARGE_NEEDED = 'Recharge'
}

export enum Direction {
    FORWARD = 'forward',
    BACKWARD = 'backward',
    LEFT = 'left',
    RIGHT = 'right'
}

export enum WorkMode {
    AUTO = 'auto',
    SMALL_ROOM = 'SmallRoom',
    SPOT = 'Spot',
    EDGE = 'Edge',
    NO_SWEEP = 'Nosweep'
}

export interface StatusResponse {
    devId: string,
    dps: {
        "1": boolean,
        "2": boolean,
        "3": string,
        "5": string,
        "15": string,
        "101": boolean,
        "102": string,
        "103": boolean,
        "104": number,
        "106": string,
    }
}

export class RoboVac {

    api: any;

    PLAY_PAUSE = '2';
    DIRECTION = '3';
    WORK_MODE = '5';
    WORK_STATUS = '15';
    GO_HOME = '101';
    CLEAN_SPEED = '102';
    FIND_ROBOT = '103';
    BATTERY_LEVEL = '104';
    ERROR_CODE = '106';

    connected: boolean = false;

    //@ts-ignore
    log: Logging = null;
    //@ts-ignore
    statuses: StatusResponse = null;
    //@ts-ignore
    lastStatusUpdate: number = null;
    maxStatusUpdateAge: number = 1000 * (1 * 30); //30 Seconds
    timeoutDuration: number;

    constructor(config: { deviceId: string, localKey: string, ip: string, port: 6668 }, log: Logging, timeoutDuration = 2) {
        this.log = log;
        if (!config.deviceId) {
            throw new Error('You must pass through deviceId');
        }
        this.api = new TuyAPI(
            {
                id: config.deviceId,
                key: config.localKey,
                ip: config.ip,
                port: config.port,
                version: '3.3',
                issueRefreshOnConnect: true
            }
        );
        this.timeoutDuration = timeoutDuration;

        this.api.on('error', (error: any) => {
            this.log.error('Robovac Error', JSON.stringify(error, null, 4));
        });

        this.api.on('connected', () => {
            this.connected = true;
            this.log.debug("Connected!");
        });

        this.api.on('disconnected', () => {
            this.connected = false;
            this.log.debug('Disconnected!');
        });

        this.api.on('dp-refresh', (data: any) => {
            this.log.debug('DP_REFRESH data from device: ', data);
            this.log.debug('Status Updated!');
        });

        this.api.on('data', (data: StatusResponse) => {
            this.log.debug('Data from device:', data);
            this.log.debug('Status Updated!');
        });

    }

    async connect() {
        if (!this.connected) {
            this.log.debug('Connecting...');
            await this.api.connect();
        }
    }

    async disconnect() {
        this.log.debug('Disconnecting...');
        await this.api.disconnect();
    }

    async doWork(work: () => Promise<any>): Promise<any> {
        if (!this.api.device.id || !this.api.device.ip) {
            this.log.debug('Looking for device...');
            try {
                await this.api.find({ timeout: this.timeoutDuration });
                this.log.debug(`Found device ${this.api.device.id} at ${this.api.device.ip}`);
            } catch (err: any) {
                this.log.debug(err.toString());
            }
        }
        await this.connect();
        return await work();
    }

    async getStatuses(force: boolean = false): Promise<{ devId: string, dps: { [key: string]: string | boolean | number } }> {
        if (force || (new Date()).getTime() - this.lastStatusUpdate > this.maxStatusUpdateAge) {
            return await this.doWork(async () => {
                this.statuses = await this.api.get({ schema: true });
                this.lastStatusUpdate = (new Date()).getTime();
                return this.statuses;
            });
        } else {
            return this.statuses;
        }
    }

    async getCleanSpeed(force: boolean = false): Promise<CleanSpeed> {
        let statuses = await this.getStatuses(force);
        return <CleanSpeed>statuses.dps[this.CLEAN_SPEED];
    }

    async setCleanSpeed(cleanSpeed: CleanSpeed) {
        await this.doWork(async () => {
            await this.set({
                [this.CLEAN_SPEED]: cleanSpeed
            })
        });
    }

    async getPlayPause(force: boolean = false): Promise<boolean> {
        let statuses = await this.getStatuses(force);
        return <boolean>statuses.dps[this.PLAY_PAUSE];
    }

    async setPlayPause(state: boolean) {
        await this.doWork(async () => {
            await this.set({
                [this.PLAY_PAUSE]: state
            })
        });
    }

    async play() {
        await this.setPlayPause(true);
    }

    async pause() {
        await this.setPlayPause(true);
    }

    async getWorkMode(force: boolean = false): Promise<WorkMode> {
        let statuses = await this.getStatuses(force);
        return <WorkMode>statuses.dps[this.WORK_MODE];
    }

    async setWorkMode(workMode: WorkMode) {
        await this.doWork(async () => {
            this.log.debug(`Setting WorkMode to ${workMode}`);
            await this.set({
                [this.WORK_MODE]: workMode
            })
        });
    }

    async startCleaning(force: boolean = false) {
        this.log.debug('Starting Cleaning', JSON.stringify(await this.getStatuses(force), null, 4));
        await this.setWorkMode(WorkMode.AUTO);

        this.log.debug('Cleaning Started!');
    }

    async getWorkStatus(force: boolean = false): Promise<WorkStatus> {
        let statuses = await this.getStatuses(force);
        return <WorkStatus>statuses.dps[this.WORK_STATUS];
    }

    async setWorkStatus(workStatus: WorkStatus) {
        await this.doWork(async () => {
            await this.set({
                [this.WORK_STATUS]: workStatus
            })
        });
    }

    async goHome() {
        // Check if it's not at home already.
        const workStatus = await this.getWorkStatus(true);
        if (workStatus === WorkStatus.COMPLETED || workStatus === WorkStatus.CHARGING) {
            this.log.debug(`RoboVac is already Home, workStatus = ${workStatus}`);
            return;
        }
        await this.doWork(async () => {
            await this.set({
                [this.GO_HOME]: true
            })
        });
    }

    async setFindRobot(state: boolean) {
        return await this.doWork(async () => {
            await this.set({
                [this.FIND_ROBOT]: state
            })
        });
    }

    async getFindRobot(force: boolean = false) {
        let statuses = await this.getStatuses(force);
        return <boolean>statuses.dps[this.FIND_ROBOT];
    }

    async getBatteyLevel(force: boolean = false) {
        let statuses = await this.getStatuses(force);
        return <number>statuses.dps[this.BATTERY_LEVEL];
    }

    async getErrorCode(force: boolean = false): Promise<ErrorCode> {
        let statuses = await this.getStatuses(force);
        return <ErrorCode>statuses.dps[this.ERROR_CODE];
    }

    async set(data: { [key: string]: string | number | boolean }) {
        this.log.debug(`Setting: ${JSON.stringify(data, null, 4)}`);
        return await this.api.set({
            multiple: true,
            data: data
        });
    }

    formatStatus() {
        this.log.debug(`
		-- Status Start --
		 - Play/Pause: ${(this.statuses.dps as any)[this.PLAY_PAUSE]}
		 - Direction: ${(this.statuses.dps as any)[this.DIRECTION]}
		 - Work Mode: ${(this.statuses.dps as any)[this.WORK_MODE]}
		 - Go Home: ${(this.statuses.dps as any)[this.GO_HOME]}
		 - Clean Speed: ${(this.statuses.dps as any)[this.CLEAN_SPEED]}
		 - Find Robot: ${(this.statuses.dps as any)[this.FIND_ROBOT]}
		 - Battery Level: ${(this.statuses.dps as any)[this.BATTERY_LEVEL]}
		 - Error Code: ${(this.statuses.dps as any)[this.ERROR_CODE]}
		-- Status End --
		`);
    }
}
