// Web stand-in for @capacitor/core: the Archive is never a native app.
export const Capacitor = { isNativePlatform: () => false, getPlatform: () => 'web', isPluginAvailable: () => false, convertFileSrc: (s) => s };
export const registerPlugin = () => new Proxy({}, { get: () => async () => { throw new Error('Not available on the web.'); } });
export default { Capacitor };
