"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const uuidv4 = require("uuid/v4");
const Logger_1 = require("./Logger");
const ortc = require("./ortc");
const Transport_1 = require("./Transport");
const Consumer_1 = require("./Consumer");
const logger = new Logger_1.default('PipeTransport');
class PipeTransport extends Transport_1.default {
    /**
     * @private
     */
    constructor(params) {
        super(params);
        logger.debug('constructor()');
        const { data } = params;
        // PipeTransport data.
        // - .tuple
        //   - .localIp
        //   - .localPort
        //   - .remoteIp
        //   - .remotePort
        //   - .protocol
        // - .sctpParameters
        //   - .port
        //   - .OS
        //   - .MIS
        //   - .maxMessageSize
        // - .sctpState
        this._data =
            {
                tuple: data.tuple,
                sctpParameters: data.sctpParameters,
                sctpState: data.sctpState
            };
        this._handleWorkerNotifications();
    }
    /**
     * Transport tuple.
     */
    get tuple() {
        return this._data.tuple;
    }
    /**
     * SCTP parameters.
     */
    get sctpParameters() {
        return this._data.sctpParameters;
    }
    /**
     * SCTP state.
     */
    get sctpState() {
        return this._data.sctpState;
    }
    /**
     * Observer.
     *
     * @override
     * @emits close
     * @emits {producer: Producer} newproducer
     * @emits {consumer: Consumer} newconsumer
     * @emits {producer: DataProducer} newdataproducer
     * @emits {consumer: DataConsumer} newdataconsumer
     * @emits {sctpState: string} sctpstatechange
     */
    get observer() {
        return this._observer;
    }
    /**
     * Close the PlainRtpTransport.
     *
     * @override
     */
    close() {
        if (this._closed)
            return;
        if (this._data.sctpState)
            this._data.sctpState = 'closed';
        super.close();
    }
    /**
     * Router was closed.
     *
     * @private
     * @override
     */
    routerClosed() {
        if (this._closed)
            return;
        if (this._data.sctpState)
            this._data.sctpState = 'closed';
        super.routerClosed();
    }
    /**
     * Get PipeTransport stats.
     *
     * @override
     */
    getStats() {
        return __awaiter(this, void 0, void 0, function* () {
            logger.debug('getStats()');
            return this._channel.request('transport.getStats', this._internal);
        });
    }
    /**
     * Provide the PipeTransport remote parameters.
     *
     * @override
     */
    connect({ ip, port }) {
        return __awaiter(this, void 0, void 0, function* () {
            logger.debug('connect()');
            const reqData = { ip, port };
            const data = yield this._channel.request('transport.connect', this._internal, reqData);
            // Update data.
            this._data.tuple = data.tuple;
        });
    }
    /**
     * Create a pipe Consumer.
     *
     * @override
     */
    consume({ producerId, appData = {} }) {
        return __awaiter(this, void 0, void 0, function* () {
            logger.debug('consume()');
            if (!producerId || typeof producerId !== 'string')
                throw new TypeError('missing producerId');
            else if (appData && typeof appData !== 'object')
                throw new TypeError('if given, appData must be an object');
            const producer = this._getProducerById(producerId);
            if (!producer)
                throw Error(`Producer with id "${producerId}" not found`);
            // This may throw.
            const rtpParameters = ortc.getPipeConsumerRtpParameters(producer.consumableRtpParameters);
            const internal = Object.assign(Object.assign({}, this._internal), { consumerId: uuidv4(), producerId });
            const reqData = {
                kind: producer.kind,
                rtpParameters,
                type: 'pipe',
                consumableRtpEncodings: producer.consumableRtpParameters.encodings
            };
            const status = yield this._channel.request('transport.consume', internal, reqData);
            const data = { kind: producer.kind, rtpParameters, type: 'pipe' };
            const consumer = new Consumer_1.default({
                internal,
                data,
                channel: this._channel,
                appData,
                paused: status.paused,
                producerPaused: status.producerPaused
            });
            this._consumers.set(consumer.id, consumer);
            consumer.on('@close', () => this._consumers.delete(consumer.id));
            consumer.on('@producerclose', () => this._consumers.delete(consumer.id));
            // Emit observer event.
            this._observer.safeEmit('newconsumer', consumer);
            return consumer;
        });
    }
    _handleWorkerNotifications() {
        this._channel.on(this._internal.transportId, (event, data) => {
            switch (event) {
                case 'sctpstatechange':
                    {
                        const { sctpState } = data;
                        this._data.sctpState = sctpState;
                        this.safeEmit('sctpstatechange', sctpState);
                        // Emit observer event.
                        this._observer.safeEmit('sctpstatechange', sctpState);
                        break;
                    }
                default:
                    {
                        logger.error('ignoring unknown event "%s"', event);
                    }
            }
        });
    }
}
exports.default = PipeTransport;
