function setZoom(n, x, y) { if(window.appSetZoom) window.appSetZoom(n, x, y); }

function toast(msg) { if(window.appToast) window.appToast(msg); }



function render() { if(window.appRender) window.appRender(); }



export const state = {

    appState: { activeCampaignId: null, campaigns: {} },

    selId: null,

    linkStart: null,

    snap: false,

    lastDeleted: null,

    viewMode: 'data',

    selWbId: null,
    selWbIds: [],
    selLink: null,     // index into the active map's links when a data-map line is selected
    drawColor: '#e9e9f0',
    drawStrokeWidth: 3,
    drawStraight: false,
    gridType: 'off',
    measureUnit: 'imperial',

    zoomLevel: 1,

    els: {},

    wbEls: {},

    cameraPositions: {}

};



export const dom = {};

window.addEventListener('error', function(e) {

      document.getElementById('toastMsg').textContent = 'ERROR: ' + e.message + ' at ' + e.lineno;

      document.getElementById('toast').className = 'show';

  });



  export const CATS = {

    surface:  {label:'Surface · Public',     color:'#e0a54f'},

    justice:  {label:'Justice Complex',       color:'#b98cff'},

    sublevel: {label:'Sublevels',             color:'#4db3d3'},

    republic: {label:'Republic',              color:'#d9534f'},

    czerka:   {label:'Czerka',                color:'#9aa4b0'},

    exchange: {label:'Exchange · Lodging',    color:'#5cb87a'},

    deep:     {label:'The Deep · Transfer',   color:'#3fb6a8'},

    custom:   {label:'Custom / Other',        color:'#c9c9d4'}

  };

  

  export const WB_COLORS = {

      'var(--panel2)': 'Dark Panel',

      'rgba(217, 83, 79, 0.3)': 'Red Tint',

      'rgba(92, 184, 122, 0.3)': 'Green Tint',

      'rgba(77, 179, 211, 0.3)': 'Blue Tint',

      'rgba(224, 165, 79, 0.3)': 'Gold Tint',

      'transparent': 'Transparent'

  };



