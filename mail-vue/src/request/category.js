import http from '@/axios/index.js';

export function categoryList() {
    return http.get('/category/list')
}

export function categoryAdd(params) {
    return http.post('/category/add', params)
}

export function categoryUpdate(params) {
    return http.put('/category/update', params)
}

export function categoryDelete(categoryId) {
    return http.delete('/category/delete', {params: {categoryId}})
}

export function categoryRuleAdd(params) {
    return http.post('/category/rule/add', params)
}

export function categoryRuleUpdate(params) {
    return http.put('/category/rule/update', params)
}

export function categoryRuleDelete(ruleId) {
    return http.delete('/category/rule/delete', {params: {ruleId}})
}

export function categoryReclassify(params) {
    return http.post('/category/reclassify', params)
}
