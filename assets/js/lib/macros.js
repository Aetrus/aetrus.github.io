// SillyTavern macro catalogue, ported from the Grimoire (core/format/Macros.kt).
// Tools here never expand macros. They are plain text in the card; the frontend substitutes them.
// Reference: https://docs.sillytavern.app/usage/core-concepts/macros/

const m = (token, description, label = token) => ({ token, label, description });

export const MACRO_GROUPS = [
  { name: 'Identity', macros: [
    m('{{user}}', 'Current persona name'),
    m('{{char}}', 'Current character name (or nickname in V3)'),
    m('{{group}}', 'Comma-separated group member names'),
    m('{{groupNotMuted}}', 'Active (unmuted) group members'),
    m('{{charIfNotGroup}}', 'Character name when not in a group'),
    m('{{notChar}}', 'Other characters in the conversation'),
  ] },
  { name: 'Character data', macros: [
    m('{{description}}', 'Inserts the character description'),
    m('{{personality}}', 'Inserts the character personality'),
    m('{{scenario}}', 'Inserts the current scenario'),
    m('{{persona}}', 'Inserts the user persona'),
    m('{{mesExamples}}', 'Inserts the example messages'),
    m('{{charFirstMessage}}', 'The first message'),
    m('{{charPrompt}}', "The character's system prompt override"),
    m('{{charJailbreak}}', "The character's post-history instructions"),
    m('{{original}}', "The user's global prompt. Only inside system_prompt or post_history_instructions"),
  ] },
  { name: 'Chat history', macros: [
    m('{{lastMessage}}', 'Last message text'),
    m('{{lastUserMessage}}', 'Last user message'),
    m('{{lastCharMessage}}', 'Last character message'),
    m('{{lastMessageId}}', 'Numeric id of the last message'),
    m('{{firstIncludedMessageId}}', 'First message id in the current context'),
    m('{{currentSwipeId}}', 'Active swipe index'),
    m('{{lastSwipeId}}', 'Index of the latest swipe'),
    m('{{summary}}', 'Active chat summary'),
    m('{{input}}', 'Latest user input'),
    m('{{model}}', 'Active model name'),
    m('{{idle_duration}}', 'Time since the last message'),
  ] },
  { name: 'Time & date', macros: [
    m('{{time}}', 'Current time'),
    m('{{date}}', 'Current date'),
    m('{{weekday}}', 'Day of the week'),
    m('{{isotime}}', 'ISO 8601 time'),
    m('{{isodate}}', 'ISO 8601 date'),
    m('{{datetimeformat YYYY-MM-DD HH:mm}}', 'Formatted date and time using moment.js tokens', '{{datetimeformat …}}'),
    m('{{time_UTC+0}}', 'Time at a UTC offset', '{{time_UTC±N}}'),
    m('{{timeDiff::a::b}}', 'Difference between two ISO timestamps'),
  ] },
  { name: 'Randomization', macros: [
    m('{{random::a::b::c}}', 'Re-rolled on every render', '{{random::…}}'),
    m('{{pick::a::b::c}}', 'Picked once and stable for the chat', '{{pick::…}}'),
    m('{{roll::1d20}}', 'Dice roll, droll syntax', '{{roll::NdN}}'),
  ] },
  { name: 'Variables', macros: [
    m('{{getvar::name}}', 'Read a local variable'),
    m('{{setvar::name::value}}', 'Write a local variable'),
    m('{{addvar::name::value}}', 'Append to a local variable'),
    m('{{incvar::name}}', 'Increment a numeric variable'),
    m('{{decvar::name}}', 'Decrement a numeric variable'),
    m('{{hasvar::name}}', 'Check whether a variable exists'),
    m('{{getglobalvar::name}}', 'Read a global variable'),
    m('{{setglobalvar::name::value}}', 'Write a global variable'),
    m('{{addglobalvar::name::value}}', 'Append to a global variable'),
    m('{{incglobalvar::name}}', 'Increment a global variable'),
    m('{{decglobalvar::name}}', 'Decrement a global variable'),
  ] },
  { name: 'Utility', macros: [
    m('{{newline}}', 'Insert a newline'),
    m('{{space}}', 'Insert a literal space'),
    m('{{noop}}', 'No-op; removes surrounding whitespace'),
    m('{{trim}}', 'Trim surrounding whitespace'),
    m('{{reverse::text}}', 'Reverse the literal text', '{{reverse::…}}'),
    m('{{// comment}}', 'Inline comment, removed at render'),
    m('{{bias "instruction"}}', 'Set a response bias for the next turn', '{{bias …}}'),
  ] },
  { name: 'Conditionals', macros: [
    m('{{if cond}}…{{else}}…{{/if}}', 'Conditional block', '{{if}} … {{/if}}'),
  ] },
];

/** The quick-access subset for compact toolbars. */
export const COMMON_MACROS = ['{{user}}', '{{char}}', '{{random::a::b::c}}', '{{pick::a::b::c}}', '{{newline}}', '{{original}}'];

/** Lower-cased macro heads for recognition, e.g. "user", "random", "getvar". */
export const MACRO_TOKENS = new Set(
  MACRO_GROUPS.flatMap((g) => g.macros)
    .map((x) => x.token.slice(2).split(/::|\s|\}/)[0].replace(/^\//, '').toLowerCase())
    .concat(['if', 'else', 'maxprompt', 'lastgenerationtype', 'random', 'pick', 'roll', 'bias', 'banned', 'char_version', 'charversion', 'mesexamplesraw', 'persona', 'outlet', 'wiafter', 'wibefore', 'loreafter', 'lorebefore', 'anbefore', 'anafter', 'systemprompt', 'defaultsystemprompt', 'instructsystem'])
);
