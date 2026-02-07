const DRIVER_PWA_CONFIG = {
    app: {
        name: 'TimePulse AI - Entregador',
        version: 'v1.0',
    },
    
    sw: {
        filepath: '/sw.js',
        offline_route: '/offline.html',
    },
    
    push: {
        active: true,
        server: {
            public_key: 'YOUR_VAPID_PUBLIC_KEY',
            endpoint: '/api/push/subscription/',
        },
        notification: {
            title: 'TimePulse AI',
            options: {
                body: 'Nova entrega disponível!',
                icon: '/pwa/icons/android/android-launchericon-192-192.png',
                badge: '/pwa/icons/android/android-launchericon-96-96.png',
                vibrate: [200, 100, 200],
                data: {
                    dateOfArrival: Date.now(),
                    primaryKey: '1',
                    clickUrl: '/driver.html',
                },
                actions: [
                    {
                        action: 'accept',
                        title: 'Aceitar',
                        icon: '/pwa/icons/android/android-launchericon-48-48.png'
                    },
                    {
                        action: 'reject',
                        title: 'Recusar',
                        icon: '/pwa/icons/android/android-launchericon-48-48.png'
                    }
                ]
            },
            notificationclick: {
                active: true,
            }
        }
    },
    
    cache: {
        images: {
            active: true,
            maxentries: 100,
            maxageseconds: 365 * 24 * 60 * 60,
        },
        statics: {
            active: true,
            maxentries: 100,
            maxageseconds: 365 * 24 * 60 * 60,
        },
        fonts: {
            active: true,
            maxentries: 50,
            maxageseconds: 365 * 24 * 60 * 60,
        },
        routes: {
            networkonly: {
                active: false,
            },
            stalewhilerevalidate: {
                active: false,
            },
            networkfirst: {
                active: true,
                regex: /.*/,
            },
            cachefirst: {
                active: false,
            },
            cacheonly: {
                active: false,
            },
        },
        custom: {
            active: false,
        },
    },
    
    precache: {
        active: true,
        routes: [
            '/driver.html',
            '/offline.html',
            '/pwa/driver-config.js',
            '/pwa/pwa.js',
            '/assets/driver-app.js',
            'https://cdn.tailwindcss.com',
            'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
            'https://api.mapbox.com/mapbox-gl-js/v3.0.1/mapbox-gl.js',
            'https://api.mapbox.com/mapbox-gl-js/v3.0.1/mapbox-gl.css',
        ],
    }
};

if (typeof PWA_CONFIG === 'undefined') {
    var PWA_CONFIG = DRIVER_PWA_CONFIG;
}
