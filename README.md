This is simply an 'on top' mod of material-fox-updated for firefox.  I've extensively modified that theme in a somewhat modular way where I've just put my personal touches on most elements by improving the consistency of the UI and changed things that didn't look right to my eye.

Installation should be pretty straightforward if you're reading this:
1. use my user.js in your main firefox profile folder
2. install material-fox-updated by edelvarden
3. download all the files in this directory and put them in your /chrome/ folder
4. grab the Inter font from google fonts, I like it for the urlbar and the numbers when its very small for ublock/gmail addon.

That's basically it.  You can look in the user.js at the userChrome.* options you can set.  I run the commented out settings.  Here they are also:

You can play around with which theme you want just make sure to have only 1 on at a time.  Don't use compact URL.  Context menu icons are nice but I'm lazy to get every single one working so I disable them.  Non chrome refresh looks more like Edge.

``` js
user_pref("userChrome.theme-blurple", false);
user_pref("userChrome.theme-catppuccin", false);
user_pref("userChrome.theme-darkblue", false);
user_pref("userChrome.theme-dracula", false);
user_pref("userChrome.theme-github", false);
user_pref("userChrome.theme-material", false);
user_pref("userChrome.theme-nord", false);
user_pref("userChrome.theme-slate", false);
user_pref("userChrome.theme-tokyonight", false);
user_pref("userChrome.theme-system-accent", true);
user_pref("userChrome.ui-chrome-refresh", false);
user_pref("userChrome.ui-compact-url-bar", false);
user_pref("userChrome.ui-context-menu-icons", false);
user_pref("userChrome.ui-force-old-icons", false);
user_pref("userChrome.ui-system-font", true);
```
