import { defineStore } from 'pinia'

export const useSettingStore = defineStore('setting', {
    state: () => ({
        domainList: [],
        domainRules: [],
        wildcardDomains: [],
        settings: {
            r2Domain: '',
            loginOpacity: 1.00,
        },
        lang: '',
    }),
    actions: {

    },
    persist: {
        pick: ['lang'],
    },
})
