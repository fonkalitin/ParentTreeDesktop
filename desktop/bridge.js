// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 ParentTree contributors
(() => {
                if (window !== window.top) return;
                const native = window.chrome.webview;
                window.parentTree = {
                    send: message => native.postMessage(message),
                    onMessage: handler => {
                        const callback = event => handler(event.data);
                        native.addEventListener('message', callback);
                        return () => native.removeEventListener('message', callback);
                    }
                };
                let previous = null;
                function sendTitle() {
                    const element = document.querySelector('[data-parenttree-title]');
                    const title = (element?.getAttribute('data-parenttree-title') || '').replace(/\s*•\s*$/, '').trim();
                    if (title === previous) return;
                    previous = title;
                    window.chrome.webview.postMessage({type: 'parenttree:title', title});
                }
                function start() {
                    sendTitle();
                    new MutationObserver(sendTitle).observe(document.body, {
                        subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['data-parenttree-title']
                    });
                }
                if (document.readyState === 'loading')
                    document.addEventListener('DOMContentLoaded', start, {once: true});
                else start();
            })();
