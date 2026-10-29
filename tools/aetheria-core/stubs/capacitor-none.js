// Web stand-in for native-only Capacitor plugins.
const none = new Proxy({}, { get: () => async () => { throw new Error('Not available on the web.'); } });
export const Filesystem = none, Directory = {}, Encoding = {}, FilePicker = none;
export default none;
