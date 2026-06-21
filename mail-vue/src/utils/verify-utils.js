export function normalizeEmail(email) {
    return String(email || '')
        .trim()
        .replace(/＠/g, '@')
        .replace(/。/g, '.')
        .replace(/．/g, '.')
        .replace(/｡/g, '.');
}

export function isEmail(email) {
    email = normalizeEmail(email);
    const reg = /^(?!.*\.\.)[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-](?:[a-zA-Z0-9!#$%&'*+/=?^_`{|}~.-]*[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-])?@([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
    return reg.test(email);
}

export function isDomain(str) {
    return /^(?!:\/\/)([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$/.test(str);
}
