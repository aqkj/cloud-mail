import http from '@/axios/index.js';

export function settingSet(setting) {
    return http.put('/setting/set', setting)
}

export function settingQuery() {
    return http.get('/setting/query')
}

export function websiteConfig() {
    return http.get('/setting/websiteConfig')
}

export function setBackground(background) {
    return http.put('/setting/setBackground',{background})
}

export function deleteBackground() {
    return http.delete('/setting/deleteBackground')
}

export function setBlackList(params) {
    return http.put('/setting/setBlacklist', params)
}

export function domainList() {
    return http.get('/setting/domain/list')
}

export function domainAdd(domains) {
    return http.post('/setting/domain/add', {domains})
}

export function domainDelete(domains) {
    return http.post('/setting/domain/delete', {domains})
}

export function domainReplace(domains) {
    return http.put('/setting/domain/replace', {domains})
}

export function domainEnsureKv() {
    return http.put('/setting/domain/ensureKv')
}
