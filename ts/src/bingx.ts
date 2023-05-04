
//  ---------------------------------------------------------------------------
import Exchange from './abstract/bingx.js';
import { AuthenticationError, ExchangeNotAvailable, AccountSuspended, PermissionDenied, RateLimitExceeded, InvalidNonce, InvalidAddress, ArgumentsRequired, ExchangeError, InvalidOrder, InsufficientFunds, BadRequest, OrderNotFound, BadSymbol, NotSupported } from './base/errors.js';
import { Precise } from './base/Precise.js';
import { sha256 } from './static_dependencies/noble-hashes/sha256.js';
import { TICK_SIZE, TRUNCATE } from './base/functions/number.js';

//  ---------------------------------------------------------------------------

export default class bingx extends Exchange {
    describe () {
        return this.deepExtend (super.describe (), {
            'id': 'bingx',
            'name': 'BingX',
            'countries': [ 'US' ], // North America, Canada, the EU, Hong Kong and Taiwan
            // 150 per 5 seconds = 30 per second
            // rateLimit = 1000ms / 30 ~= 33.334
            'rateLimit': 100,
            'version': 'v1',
            'certified': true,
            'pro': true,
            'has': {
                'CORS': undefined,
                'spot': true,
                'margin': true,
                'swap': undefined, // has but unimplemented
                'future': false,
                'option': undefined,
            },
            'hostname': 'bingx.com',
            'urls': {
                'logo': 'https://user-images.githubusercontent.com/1294454/129991357-8f47464b-d0f4-41d6-8a82-34122f0d1398.jpg',
                'api': {
                    'spot': 'https://open-api.bingx.com/openApi/spot',
                    'swap': 'https://open-api.bingx.com/openApi/swap',
                    'contract': 'https://open-api.bingx.com/openApi/contract',
                },
                'www': '',
                'doc': '',
                'referral': {
                    'url': 'http://www.bitmart.com/?r=rQCFLh',
                    'discount': 0.3,
                },
                'fees': '',
            },
            'requiredCredentials': {
                'apiKey': true,
                'secret': true,
            },
            'api': {
                'spot': {
                    'v1': {
                        'public': {
                            'get': {
                                'common/symbols': 1,
                                'market/trades': 1,
                                'market/depth': 1,
                                'market/getLatestKline': 1,
                            },
                        },
                        'private': {
                            'get': {
                            },
                            'post': {
                            },
                        },
                    },
                },
                'swap': {
                    'v2': {
                        'public': {
                            'get': {
                                'server/time': 1,
                                'quote/contracts': 1,
                                'quote/price': 1,
                                'quote/depth': 1,
                                'quote/trades': 1,
                                'quote/premiumIndex': 1,
                                'quote/fundingRate': 1,
                                'quote/klines': 1,
                                'quote/openInterest': 1,
                                'quote/ticker': 1,
                            },
                            'post': {
                            },
                        },
                        'private': {
                            'post': {
                            },
                        },
                    },
                },
                'contract': {
                    'v1': {
                        'public': {
                            'get': {
                            },
                        },
                    },
                },
            },
            'timeframes': {
                '1m': '1',
                '3m': '3',
                '5m': '5',
                '15m': '15',
                '30m': '30',
                '1h': '60',
                '2h': '120',
                '4h': '240',
                '6h': '360',
                '12h': '720',
                '1d': '1D',
                '1w':  '1W',
                '1M':'1M'
            },
            'fees': {
                'trading': {
                },
            },
            'precisionMode': TICK_SIZE,
            'exceptions': {
                'exact': {
                },
                'broad': {},
            },
            'commonCurrencies': {
            },
            'options': {
            },
        });
    }

    async fetchSpotMarkets (params) {
        const response = await this.spotV1PublicGetCommonSymbols (params);
        console.log (response);
        const data = this.safeValue (response, 'data');
        const symbols = this.safeValue (data, 'symbols');
        console.log(symbols);
        return symbols;
    }

    async fetchSwapMarkets (params) {
        const response = await this.swapV2PublicGetQuoteContracts (params);
        console.log (response);
        const data = this.safeValue (response, 'data');
        const symbols = this.safeValue (data, 'symbols');
        console.log(symbols);
        return symbols;
    }

    async fetchMarkets (params = {}) {
        /**
         * @method
         * @name bingx#fetchMarkets
         * @description retrieves data on all markets for bingx
         * @see https://bingx-api.github.io/docs/swapV2/market-api.html#_1-contract-information
         * @see https://bingx-api.github.io/docs/spot/market-interface.html#query-symbols
         * @param {object} params extra parameters specific to the exchange api endpoint
         * @returns {[object]} an array of objects representing market data
         */
        const promisesUnresolved = [
            this.fetchSpotMarkets (params),
            this.fetchSwapMarkets (params),
        ];
        const promises = await Promise.all(promisesUnresolved);
        const spotMarkets = this.safeValue(promises, 0);
        const swapMarkets = this.safeValue(promises, 1);
        return this.arrayConcat (spotMarkets, swapMarkets);
    }

    // async fetchOHLCV (symbol: string, timeframe = '1m', since: Int = undefined, limit: Int = undefined, params = {}) {
    //     /**
    //      * @method
    //      * @name bingx#fetchOHLCV
    //      * @description fetches historical candlestick data containing the open, high, low, and close price, and the volume of a market
    //      * @see https://bingx-api.github.io/docs/swap/market-api.html#_7-get-k-line-data
    //      * @param {string} symbol unified symbol of the market to fetch OHLCV data for
    //      * @param {string} timeframe the length of time each candle represents
    //      * @param {int|undefined} since timestamp in ms of the earliest candle to fetch
    //      * @param {int|undefined} limit the maximum amount of candles to fetch
    //      * @param {object} params extra parameters specific to the bingx api endpoint
    //      * @param {string|undefined} params.price "mark" or "index" for mark price and index price candles
    //      * @param {int|undefined} params.until timestamp in ms of the latest candle to fetch
    //      * @returns {[[int]]} A list of candles ordered as timestamp, open, high, low, close, volume
    //      */
    // }

    sign (path, section = 'public', method = 'GET', params = {}, headers = undefined, body = undefined) {
        const type = section[0];
        const version = section[1];
        const access = section[2];
        let url = this.implodeHostname (this.urls['api'][type]);
        url += '/' + version + '/';
        path = this.implodeParams (path, params);
        params = this.omit (params, this.extractParams (path));
        params = this.keysort (params);
        if (access === 'public') {
            url += path;
            if (Object.keys (params).length) {
                url += '?' + this.urlencode (params);
            }
        } else {
            this.checkRequiredCredentials ();
            headers = {
                'X-BX-APIKEY': this.apiKey,
            };
        }
        return { 'url': url, 'method': method, 'body': body, 'headers': headers };
    }

    handleErrors (httpCode, reason, url, method, headers, body, response, requestHeaders, requestBody) {
        
    }
}