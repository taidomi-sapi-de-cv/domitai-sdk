const debug = require('debug')('liquidity:domitai')
  , io = require('socket.io-client')
  , request = require('superagent')
  , jwt = require('jsonwebtoken')
  , moment = require('moment')
  , _ = require('lodash')
  , BC = require('bignumber.js')

BC.config({ DECIMAL_PLACES: 8, ROUNDING_MODE: BC.ROUND_DOWN, EXPONENTIAL_AT: [ -64, 1024 ] });

const Domitai = function (params) {
  const { markets = [ 'btc_mxn' ], apiKey, apiSecret, apiURL = 'https://domitai.com', preferSocket = true } = params || {};
  const uuid = require('uuid').v4;
  debug('Inicializando servicio de Domitai para %o', markets);

  const socket = io(apiURL);
  let connected = false;

  const onLatest_trades = async items => {
    if (Array.isArray(items)) return;
    return latestTradesCallback(items);
  };

  const onForex_Quote = async items => {
    return forexQuoteCallback(items);
  };

  const onBalances = async items => {
    return balancesCallback(items);
  };

  socket.on('connect', async () => {
    if (!connected) {
      debug('Conectando al socket de Domitai');
      socket.on(`latest_trades`, onLatest_trades);
      socket.on(`forex`, onForex_Quote);
      socket.on(`balances`, onBalances);
      await request.get(`${apiURL}/api/forex-join?socket_id=${socket.id}`);
      connected = true;
    }
  });

  socket.on('reconnect', async () => {
    if (connected) {
      debug('Re-conectando al socket de Domitai');
      socket.on(`latest_trades`, onLatest_trades);
      socket.on(`forex`, onForex_Quote);
      socket.on(`balances`, onBalances);
      await request.get(`${apiURL}/api/forex-join?socket_id=${socket.id}`);
    }
  });

  socket.on('disconnect', () => {
    debug('Desconectado del socket de Domitai');
    socket.off(`latest_trades`, onLatest_trades);
    socket.off(`forex`, onForex_Quote);
    socket.off(`balances`, onBalances);
    process.exit();
  });


  let setBuyFunction = async () => {
  };
  let setSellFunction = async () => {
  };

  let buyCallback = async () => {
  };
  let sellCallback = async () => {
  };

  let latestTradesCallback = async () => {
  };

  let forexQuoteCallback = async () => {
  };

  let balancesCallback = async () => {
  };

  const auth = () => {
    let token;
    token = jwt.sign({ key: apiKey, nonce: moment().valueOf() }, apiSecret);
    return { 'Authorization': `bearer ${token}`, 'Content-Type': 'application/json' };
  };

  function debounce(func, wait, immediate = false) {
    var timeout;
    return function () {
      var context = this, args = arguments;
      var later = function () {
        timeout = null;
        if (!immediate) {
          func.apply(context, args);
        }
      };
      var callNow = immediate && !timeout;
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
      if (callNow) {
        func.apply(context, args);
      }
    };
  }

  return {
    socket,
    buy: (market, amount, rate, opts = {}) => {
      const { reserved_only = false, total, magic = 0 } = opts;
      if ((BC.BigNumber(amount).lte(0) && BC.BigNumber(total).lte(0)) || BC.BigNumber(rate).lte(0)) return Promise.reject(`buy: amount ${amount} ; ${total} o rate ${rate} incorrectos`);
      const body = {
        amount,
        total,
        rate,
        book: 'bids',
        market,
        reserved_only,
        magic
      };
      debug('BUY', JSON.stringify(body));
      if (preferSocket && apiKey && apiSecret) {
        const nonce = Math.random().toString(36).replace('0.', '');
        const payload = jwt.sign({ action: `order/post`, nonce, api: true, payload: body }, apiSecret);
        const bearer = jwt.sign({ nonce, key: apiKey }, apiSecret);
        return new Promise((resolve) => {
          const cb = (data) => {
            socket.off('order post', cb);
            resolve(data);
          };
          socket.on('order post', cb);
          socket.emit('api', { bearer, payload });
        });
      }
      return request.post(`${apiURL}/api/order`)
        .set(auth())
        .send(body)
        .then(res => res.body);
    },
    sell: (market, amount, rate, opts = {}) => {
      const { reserved_only = false, total, magic = 0 } = opts;
      if ((BC.BigNumber(amount).lte(0) && BC.BigNumber(total).lte(0)) || BC.BigNumber(rate).lte(0)) return Promise.reject(`sell: amount ${amount} ; ${total} o rate ${rate} incorrectos`);
      const body = {
        amount,
        total,
        rate,
        book: 'asks',
        market,
        reserved_only,
        magic
      };
      debug('SELL', JSON.stringify(body));
      if (preferSocket && apiKey && apiSecret) {
        const nonce = Math.random().toString(36).replace('0.', '');
        const payload = jwt.sign({ action: `order/post`, nonce, api: true, payload: body }, apiSecret);
        const bearer = jwt.sign({ nonce, key: apiKey }, apiSecret);
        return new Promise((resolve) => {
          const cb = (data) => {
            socket.off('order post', cb);
            resolve(data);
          };
          socket.on('order post', cb);
          socket.emit('api', { bearer, payload });
        });
      }
      return request.post(`${apiURL}/api/order`)
        .set(auth())
        .send(body)
        .then(res => res.body);
    },
    cancel: (oid) => {
      if (preferSocket && apiKey && apiSecret) {
        const nonce = Math.random().toString(36).replace('0.', '');
        const payload = jwt.sign({ action: `order/delete/${oid}`, nonce, api: true }, apiSecret);
        const bearer = jwt.sign({ nonce, key: apiKey }, apiSecret);
        return new Promise((resolve) => {
          const cb = (data) => {
            socket.off('order delete', cb);
            resolve(data);
          };
          socket.on('order delete', cb);
          socket.emit('api', { bearer, payload });
        });
      }
      return request.delete(`${apiURL}/api/order/${oid}`)
        .set(auth())
        .then(res => res.body);
    },
    withdraw: (symbol, recipients) => {
      const [ address, params ] = Object.entries(recipients)[0];
      const body = { symbol, address, ..._.pick(params, [ 'fee', 'amount', 'extra', 'description', 'addToCatalog' ]) };
      if (preferSocket && apiKey && apiSecret) {
        const nonce = Math.random().toString(36).replace('0.', '');
        const payload = jwt.sign({ action: `withdrawals/post`, nonce, api: true, payload: body }, apiSecret);
        const bearer = jwt.sign({ nonce, key: apiKey }, apiSecret);
        return new Promise((resolve) => {
          const cb = (data) => {
            socket.off('withdrawals post', cb);
            resolve(data);
          };
          socket.on('withdrawals post', cb);
          socket.emit('api', { bearer, payload });
        });
      }
      return request.post(`${apiURL}/api/withdrawals`)
        .set(auth())
        .send(body)
        .then(res => res.body);
    },
    deposit: (symbol) => {
      const body = { symbol };
      if (preferSocket && apiKey && apiSecret) {
        const nonce = Math.random().toString(36).replace('0.', '');
        const payload = jwt.sign({ action: `address/post`, nonce, api: true, payload: body }, apiSecret);
        const bearer = jwt.sign({ nonce, key: apiKey }, apiSecret);
        return new Promise((resolve) => {
          const cb = (data) => {
            socket.off('address post', cb);
            resolve(data);
          };
          socket.on('address post', cb);
          socket.emit('api', { bearer, payload });
        });
      }
      return request.post(`${apiURL}/api/address`)
        .set(auth())
        .send(body)
        .then(res => res.body);
    },
    balances: () => {
      if (preferSocket && apiKey && apiSecret) {
        const nonce = Math.random().toString(36).replace('0.', '');
        const payload = jwt.sign({ action: 'account/getBalances', nonce, api: true }, apiSecret);
        const bearer = jwt.sign({ nonce, key: apiKey }, apiSecret);
        return new Promise((resolve) => {
          const cb = (data) => {
            socket.off('balances', cb);
            resolve(data);
          };
          socket.on('balances', cb);
          socket.emit('api', { bearer, payload });
        });
      }
      return request.get(`${apiURL}/api/balances`)
        .set(auth())
        .then(res => res.body);
    },
    orders: () => {
      if (preferSocket && apiKey && apiSecret) {
        const nonce = Math.random().toString(36).replace('0.', '');
        const payload = jwt.sign({ action: 'order/get', nonce, api: true }, apiSecret);
        const bearer = jwt.sign({ nonce, key: apiKey }, apiSecret);
        return new Promise((resolve) => {
          const cb = (data) => {
            socket.off('order', cb);
            resolve(data);
          };
          socket.on('order', cb);
          socket.emit('api', { bearer, payload });
        });
      }
      return request.get(`${apiURL}/api/order`)
        .set(auth())
        .then(res => res.body);
    },
    balance: (symbol) => {
      if (preferSocket && apiKey && apiSecret) {
        const nonce = Math.random().toString(36).replace('0.', '');
        const payload = jwt.sign({ action: 'account/get/' + symbol, nonce, api: true }, apiSecret);
        const bearer = jwt.sign({ nonce, key: apiKey }, apiSecret);
        return new Promise((resolve) => {
          const cb = (data) => {
            socket.off('accounts', cb);
            resolve(data);
          };
          socket.on('accounts', cb);
          socket.emit('api', { bearer, payload });
        });
      }
      return request.get(`${apiURL}/api/balance/${symbol}`)
        .set(auth())
        .then(res => res.body);
    },
    ticker: (book) => {
      if (preferSocket && apiKey && apiSecret) {
        const nonce = Math.random().toString(36).replace('0.', '');
        const payload = jwt.sign({ action: 'market/ticker/' + book, nonce, api: true }, apiSecret);
        const bearer = jwt.sign({ nonce, key: apiKey }, apiSecret);
        return new Promise((resolve) => {
          const cb = (data) => {
            socket.off('ticker', cb);
            resolve(data);
          };
          socket.on('ticker', cb);
          socket.emit('api', { bearer, payload });
        });
      }
      return request.get(`${apiURL}/api/ticker/${book}`)
        .then(res => res.body);
    },
    pos: {
      newPayment: ({ slug, currency = 'MXN', amount, customer_data = {}, generateQR = false }) => {
        const body = { slug, currency, amount, customer_data, generateQR };
        if (preferSocket) {
          const nonce = Math.random().toString(36).replace('0.', '');
          const payload = jwt.sign({ action: `pos/post`, nonce, payload: body }, nonce);
          return new Promise((resolve) => {
            const cb = (data) => {
              socket.off(`pos_order`, cb);
              resolve(data);
            };
            socket.on(`pos_order`, cb);
            socket.emit(`api`, { payload });
          });
        }
        return request.post(`${apiURL}/api/pos`)
          .send(body)
          .then(res => res.body);
      },
      getPayment: (oid, generateQR = false) => {
        if (preferSocket) {
          const nonce = Math.random().toString(36).replace('0.', '');
          const payload = jwt.sign({ action: `pos/get/${oid}`, nonce }, nonce);
          return new Promise((resolve) => {
            const cb = (data) => {
              socket.off(`pos_order`, cb);
              resolve(data);
            };
            socket.on(`pos_order`, cb);
            socket.emit(`api`, { payload });
          });
        }
        return request.get(`${apiURL}/api/pos/${oid}`)
          .query({ generateQR })
          .then(res => res.body);
      },
      getPaymentStatus: (oid) => {
        if (preferSocket) {
          const nonce = Math.random().toString(36).replace('0.', '');
          const payload = jwt.sign({ action: `pos/status/${oid}`, nonce }, nonce);
          return new Promise((resolve) => {
            const cb = (data) => {
              socket.off(`pos_order`, cb);
              resolve(data);
            };
            socket.on(`pos_order`, cb);
            socket.emit(`api`, { payload });
          });
        }
        return request.get(`${apiURL}/api/pos/status/${oid}`)
          .then(res => res.body);
      },
      getBySlug: (slug) => {
        if (preferSocket) {
          const nonce = Math.random().toString(36).replace('0.', '');
          const payload = jwt.sign({ action: `pos/getBySlug/${slug}`, nonce }, nonce);
          return new Promise((resolve) => {
            const cb = (data) => {
              socket.off(`pos`, cb);
              resolve(data);
            };
            socket.on(`pos`, cb);
            socket.emit(`api`, { payload });
          });
        }
        return request.get(`${apiURL}/api/pos/byslug/${slug}`)
          .then(res => res.body);
      },
      setCustomerData: ({ oid, customer_data, merge = true }) => {
        const body = { customer_data, merge };
        if (preferSocket) {
          const nonce = Math.random().toString(36).replace('0.', '');
          const payload = jwt.sign({ action: `pos/set_customer_data`, nonce, payload: body }, nonce);
          return new Promise((resolve) => {
            const cb = (data) => {
              socket.off(`pos_order`, cb);
              resolve(data);
            };
            socket.on(`pos_order`, cb);
            socket.emit(`api`, { payload });
          });
        }
        return request.post(`${apiURL}/api/pos/set_customer_data/${oid}`)
          .send(body)
          .then(res => res.body);
      },
      listen: (oid) => {
        return request.get(`${apiURL}/api/pos/listen/${oid}?socket_id=${socket.id}`)
          .then(res => res.body);
      },
      mute: (oid) => {
        return request.get(`${apiURL}/api/pos/mute/${oid}?socket_id=${socket.id}`)
          .then(res => res.body);
      },
      wait: (oid) => {
        return new Promise((resolve) => {
          const cb = (data) => {
            socket.off(`pos_web`, cb);
            resolve(data);
          };
          socket.on(`pos_web`, cb);
        });
      }
    },
    setBuyAction: (fn, debounceTime = false) => {
      setBuyFunction = debounce(fn, debounceTime === false ? process.env.DEBOUNCE_TIME : debounceTime, debounceTime === false);
    },
    setSellAction: (fn, debounceTime = false) => {
      setSellFunction = debounce(fn, debounceTime === false ? process.env.DEBOUNCE_TIME : debounceTime, debounceTime === false);
    },
    setBuyCallback: (fn, debounceTime = false) => {
      buyCallback = debounce(fn, debounceTime === false ? process.env.DEBOUNCE_TIME : debounceTime, debounceTime === false);
    },
    setSellCallback: (fn, debounceTime = false) => {
      sellCallback = debounce(fn, debounceTime === false ? process.env.DEBOUNCE_TIME : debounceTime, debounceTime === false);
    },
    setOnLatestTradesCallback: (fn, debounceTime = false) => {
      latestTradesCallback = debounce(fn, debounceTime === false ? process.env.DEBOUNCE_TIME : debounceTime, debounceTime === false);
    },
    setOnForexQuoteCallback: (fn, debounceTime = false) => {
      forexQuoteCallback = debounce(fn, debounceTime === false ? process.env.DEBOUNCE_TIME : debounceTime, debounceTime === false);
    },
    setMarketParams: (marketParams) => {
      this.marketParams = marketParams;
    },
    auth
  }
};


module.exports = Domitai;
