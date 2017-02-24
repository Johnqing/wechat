const ajax = require('request');

// 需要是服务号的
const APPID = 'wx232df512421';
const APPSECRET = 'a7c5cfa3d62f664d5fed';

function makeUrl(options) {
    return url.format(options);
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


    // get请求时，走querystring
    if (method === 'GET') {
        param.qs = options.data;
    } else {
        param.form = options.data;
    }
    return new Promise((resolve, reject) => {

        request(param, (err, request, body) => {
            // 错误记录
            if (err) {
                resolve(util.errorModal('ERR_SYSTEM_ERROR'));
                return
            }

            let data = body;
            try {
                data = typeof data === 'string' ? JSON.parse(data) : data;
            } catch (err) {
                resolve(util.errorModal('ERR_SYSTEM_ERROR'));
                data = null;
                console.log(body);
                return;
            }
            resolve(data);
        });
    });

}
/**
 * 微信类
 */
class Wechat {
    constructor(options) {
        this.appid = options.appid;
        this.secret = options.secret;
        this.state = options.state || 'a-zA-Z0-9';
    }

    /**
     * 公众号app权限认证
     * @returns {*}
     */
    getAppAccessToken() {
        let authUrl = makeUrl({
            protocol: 'https',
            host: "api.weixin.qq.com",
            pathname: "/cgi-bin/token",
            query: {
                appid: this.appid,
                secret: this.secret
            },
            hash: "wechat_redirect"
        });
        return proxy({
            url: authUrl
        }).then((result)=>{
            this.appAccessToken = result.access_token;
            return result;
        })
    }

    /**
     * 获取用户授权信息
     * @param redirect
     * @returns {*}
     */
    getAuthUrl(redirect){
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
    getUserAccessToken(){
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
        });
    }

    /**
     * 发送单个模板
     * @returns {*}
     */
    sendTemplateMsg(options){
        let accessTokenUrl = makeUrl({
            protocol: 'https',
            host: 'api.weixin.qq.com',
            pathname: '/cgi-bin/message/template/send',
            query: {
                access_token: this.appAccessToken
            }
        });
        return proxy({
            url: accessTokenUrl,
            data: {
                "touser": options.openid,
                "template_id": options.template_id,
                "url": options.return_url,
                "data": {
                    "first": {
                        "value": options.first,
                        "color": "#000"
                    },
                    "keyword1": {
                        "value": options.keyword1,
                        "color": "#173177"
                    },
                    "keyword2": {
                        "value": options.keyword2,
                        "color": "#173177"
                    },
                    "keyword3": {
                        "value": options.keyword3,
                        "color": "#173177"
                    },
                    "remark": {
                        "value": options.remark,
                        "color": "#000"
                    }
                }
            }
        });
    }
}
