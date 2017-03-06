const log4js = require('log4js');
const logger = log4js.getLogger('[WECHAT]');

const https = require('https');
const url = require('url');

const ajax = require('request');
const crypto = require('crypto');
const jsSHA = require('jssha');

function makeUrl(options) {
    return url.format(options);
}


function genHash(content, algorithm) {
    const c = crypto.createHash(algorithm);
    c.update(content);
    return c.digest('hex');
}

/**
 * Generate sha1 content
 * @param {*} content
 * @return {string}
 */
function genSHA1(content) {
    return genHash(content, 'sha1');
}


function createNonceStr() {
    return Math.random().toString(36).substr(2, 15);
}

function createTimestamp() {
    return parseInt(new Date().getTime() / 1000) + '';
}

function raw(args) {
    var keys = Object.keys(args);
    keys = keys.sort()
    var newArgs = {};
    keys.forEach(function (key) {
        newArgs[key.toLowerCase()] = args[key];
    });

    var string = '';
    for (var k in newArgs) {
        string += '&' + k + '=' + newArgs[k];
    }
    string = string.substr(1);
    return string;
}

/**
 * 代理请求
 * @param options
 * @returns {Promise}
 */
function proxy(options) {
    // data
    options.data = options.data || {};

    const method = (options.type || 'POST').toUpperCase();
    let url = (options.api || '') + options.url;

    // 参数配置
    let param = {
        method: method,
        uri: url,
        //useQuerystring: true,
        // 忽略证书
        strictSSL: false
    };

    if(options.json){
        param.json = true;
    }


    // get请求时，走querystring
    if (method === 'GET') {
        param.qs = options.data;
    } else {
        param.form = options.data;
    }
    logger.info('[OPTION]', JSON.stringify(param));
    return new Promise((resolve, reject) => {

        ajax(param, (err, request, body) => {
            // 错误记录
            if (err) {
                logger.error(err);
                resolve(util.errorModal('ERR_SYSTEM_ERROR'));
                return
            }

            let data = body;
            try {
                data = typeof data === 'string' ? JSON.parse(data) : data;
            } catch (err) {
                resolve(util.errorModal('ERR_SYSTEM_ERROR'));
                data = null;
                logger.info(body);
                return;
            }
            resolve(data);
        });
    });
}
/**
 * 返回promise
 * @param key
 * @returns {Promise}
 */
function callbackPromise(key){
    return new Promise((resolve, reject) => {
        resolve(key);
    });
}

function getCurrentTimestamp(){
    return (new Date().getTime())/1000;
}

/**
 * 微信类
 */
class Wechat {
    constructor(options) {
        // 需要用服务号的
        this.wechatToken = options.wechatToken;
        this.appid = options.appid;
        this.secret = options.secret;
        this.state = options.state || 'a-zA-Z0-9';
    }

    /**
     * 公众号app权限认证
     * @returns {*}
     */
    getAppAccessToken() {
        let now = getCurrentTimestamp();
        if(this.appAccessToken && (now - (this.appAccessTokenTime || now)) < 7200){
           return callbackPromise(this.appAccessToken);
        }

        let authUrl = makeUrl({
            protocol: 'https',
            host: "api.weixin.qq.com",
            pathname: "/cgi-bin/token",
            query: {
                grant_type: 'client_credential',
                appid: this.appid,
                secret: this.secret
            }
        });
        return proxy({
            url: authUrl
        }).then((result)=> {
            this.appAccessTokenTime = now;
            this.appAccessToken = result.access_token;
            return result;
        })
    }

    /**
     * token验证
     * @param query
     * @returns {boolean}
     */
    verifySignature (query) {
        const keys = [this.wechatToken, query['timestamp'], query['nonce']];
        let str = keys.sort().join('');
        str = genSHA1(str);
        return str === query.signature;
    }
    /**
     * 获取用户授权信息
     * @param redirect
     * @returns {*}
     */
    getAuthUrl(redirect, scope) {
        let authUrl = {
            protocol: 'https',
            host: "open.weixin.qq.com",
            pathname: "/connect/oauth2/authorize",
            query: {
                appid: this.appid,
                redirect_uri: redirect,
                response_type: 'code',
                scope: scope,
                state: this.state || '1'
            },
            hash: "wechat_redirect"
        };
        return makeUrl(authUrl);
    }

    /**
     * 获取用户openid
     * @returns {*}
     */
    getUserAccessToken(code) {
        let now = getCurrentTimestamp();
        this.userAccessToken = this.userAccessToken || {};
        if(this.userAccessToken[code] && (now - (this.userAccessToken[code].expires_in || now)) < 7200){
            return callbackPromise(this.userAccessToken[code]);
        }

        let accessTokenUrl = makeUrl({
            protocol: 'https',
            host: 'api.weixin.qq.com',
            pathname: '/sns/oauth2/access_token',
            query: {
                appid: this.appid,
                secret: this.secret,
                code: code,
                grant_type: "authorization_code"
            }
        });
        return proxy({
            url: accessTokenUrl
        }).then((res)=>{
            this.userAccessToken[code] = res;
            return res;
        })
    }

    /**
     * 刷新用户Token
     * @returns {*}
     */
    refreshUserToken(options) {
        let tokenUrl = makeUrl({
            protocol: 'https',
            host: 'api.weixin.qq.com',
            pathname: '/sns/oauth2/refresh_token',
            query: {
                openid: options.openid,
                grant_type: 'refresh_token',
                refresh_token: options.refresh_token
            }
        });
        return proxy({
            url: tokenUrl
        });
    }

    /**
     * 二维码
     * @param redirect_uri
     * @returns {*}
     */
    getQRCodeAuthUrl(redirect_uri) {
        let qrcodeUrl = {
            protocol: 'https',
            host: 'open.weixin.qq.com',
            pathname: '/connect/qrconnect',
            query: {
                appid: this.appid,
                redirect_uri: redirect_uri,
                response_type: 'code',
                scope: 'snsapi_login'
            },
            hash: 'wechat_redirect'
        };

        return makeUrl(qrcodeUrl);
    }

    /**
     * 生产签名
     * @param url
     * @returns {*}
     */
    signJSSDK(url) {
        return this.getTicket().then((jsapiTicket) => {
            let ret = {
                jsapi_ticket: jsapiTicket,
                nonceStr: createNonceStr(),
                timestamp: createTimestamp(),
                url: url
            };
            let string = raw(ret);
            let shaObj = new jsSHA(string, 'TEXT');
            ret.signature = shaObj.getHash('SHA-1', 'HEX');
            ret.appId = this.appId;

            delete ret.jsapi_ticket;
            delete ret.url;
            return ret;
        });

    }

    /**
     * 获取tikect
     * @returns {*}
     */
    getTicket() {
        if (this.jsapiTicket) {
            return callbackPromise(this.jsapiTicket);
        }

        return this.getAppAccessToken().then(()=> {
            let ticketUrl = makeUrl({
                protocol: 'https',
                host: 'api.weixin.qq.com',
                pathname: '/cgi-bin/ticket/getticket',
                query: {
                    access_token: this.appAccessToken,
                    type: 'jsapi'
                }
            });
            return proxy({
                url: ticketUrl
            })
        }).then((res)=> {
            this.jsapiTicket = res.ticket;
            return res;
        })
    }

    /**
     * 发送单个模板
     * @returns {*}
     */
    sendTemplateMsg(options) {
        const json = {
            touser: options.openid,
            template_id: options.template_id,
            url: options.return_url,
            topcolor:'#FF0000',
            data: options.data
        };

        const bodyString = JSON.stringify(json);

        const config = {
            host: 'api.weixin.qq.com',
            port: '443',
            path: `/cgi-bin/message/template/send?access_token=${this.appAccessToken}`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': bodyString.length
            }
        };
        return new Promise((resolve, reject) => {
            const request = https.request(config, (res) => {
                if (res['statusCode'] == 200){
                    var data = '';
                    res.on('data', (chunk) => {
                        data += chunk.toString();
                    });
                    res.on('end', () => {
                        resolve(JSON.parse(data));
                    });

                    res.on('error', (err) => {
                        reject(err);
                    });
                }
                else {
                    reject(res);
                }
            });

            request.write(bodyString);
            request.end();
        });
    }
}
module.exports = Wechat;
