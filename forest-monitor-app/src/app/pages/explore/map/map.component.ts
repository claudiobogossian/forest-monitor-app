
import { Component, OnInit, Input } from '@angular/core';

import * as L from 'leaflet';
import 'leaflet.fullscreen/Control.FullScreen.js';
import 'src/assets/plugins/Leaflet.Coordinates/Leaflet.Coordinates-0.1.5.min.js';
import 'esri-leaflet/dist/esri-leaflet.js';
import 'leaflet-control-geocoder/dist/Control.Geocoder.js';
import * as LE from 'esri-leaflet-geocoder/dist/esri-leaflet-geocoder.js';

import { latLng, MapOptions, Layer, Map as MapLeaflet,
  LatLngBoundsExpression, Control, Draw, rectangle } from 'leaflet';
import { BdcLayer } from './layers/layer.interface';
import { LayerService } from './layers/layer.service';
import { Store, select } from '@ngrx/store';
import { ExploreState } from '../explore.state';
import { setPositionMap, setBbox, removeLayers, setLayers, removeGroupLayer, setSelectedFeatureRemove } from '../explore.action';
import { AuthService } from '../../auth/auth.service';
import { Router } from '@angular/router';

/**
 * Map component
 * component to manage and initialize map in explore page
 */
@Component({
  selector: 'app-base-map',
  templateUrl: './map.component.html',
  styleUrls: ['./map.component.scss']
})
export class MapComponent implements OnInit {

  /** props with width of the map */
  @Input() width: number;
  /** props with height of the map */
  @Input() height: number;

  /** pointer to reference map */
  public map: MapLeaflet;
  /** object with map settings */
  public options: MapOptions;
  /** layers displayed on the Leaflet control component */
  public layersControl: any;
  public drawControl: Control;
  public drawnItems: L.FeatureGroup;
  
  /** bounding box of Map */
  private bbox = null;

  /** start Layer and Seatch Services */
  constructor(
    private ls: LayerService,
    private as: AuthService,
    private store: Store<ExploreState>) {
      this.store.pipe(select('explore')).subscribe(res => {
        // add layers
        if (Object.values(res.layers).length > 1) {
          const lyrs = Object.values(res.layers).slice(0, (Object.values(res.layers).length - 1)) as Layer[];
          lyrs.forEach( l => {
            if (l['options'].className) {
              if (l['options'].className.indexOf(`qls_`) >= 0) {
                (l as L.TileLayer).setZIndex(3);
              }
            }
            this.map.addLayer(l);
          });
          this.store.dispatch(setLayers([]));
        }

        // remove layers by title
        if (Object.values(res.layersToDisabled).length > 1) {
          const lyrs = Object.values(res.layersToDisabled).slice(0, (Object.values(res.layersToDisabled).length - 1)) as Layer[];
          this.map.eachLayer( l => {
            if (l['options'].className && lyrs.indexOf(l['options'].className) >= 0) {
              this.map.removeLayer(l);
              if (l['options'].className === 'drawPolygons') {
                this.drawnItems.clearLayers();
              }
            }
          });
          this.store.dispatch(removeLayers([]));
        }

        // remove layers by prefix
        if (res.layerGroupToDisabled['key'] && res.layerGroupToDisabled['prefix']) {
          const key = res.layerGroupToDisabled['key'];
          const prefix = res.layerGroupToDisabled['prefix'];
          this.map.eachLayer( l => {
            if (l['options'][key] && l['options'][key].indexOf(prefix) >= 0) {
              this.map.removeLayer(l);
            }
          });
          this.store.dispatch(removeGroupLayer({}));
        }

        // set position map
        if (res.positionMap && res.positionMap !== this.bbox) {
          this.bbox = res.positionMap;
          this.setPosition(res.positionMap);
        }
      });
  }

  /**
   * set layers and initial configuration of the map
   */
  ngOnInit() {
    this.options = {
      zoom: 6,
      center: latLng(-6.18, -58)
    };

    setTimeout(() => {
      this.setControlLayers();
      this.setDrawControl();
      this.setViewInfo();
    }, 1000);
  }

  /**
   * set position of the Map
   */
  private setPosition(bounds: LatLngBoundsExpression) {
    this.map.fitBounds(Object.values(bounds).slice(0, 2));
  }

  /**
   * set Draw control of the map
   */
  private setDrawControl() {
    const drawnItems = new L.FeatureGroup().addTo(this.map);
    const config: Control.DrawConstructorOptions = {
      draw: {
        marker: false,
        circle: false,
        polyline: false,
        polygon: false,
        circlemarker: false,
        rectangle: {
          shapeOptions: {
            color: '#666'
          }
        }
      }
    }
    if (this.as.checkAuthPost()) {
      config['edit'] = { featureGroup: drawnItems };
    }

    const drawControl = new Control.Draw(config);
    this.drawControl = drawControl;
    this.drawnItems = drawnItems;
    this.map.addControl(drawControl);

    // remove last bbox if rectangle type
    this.map.on(Draw.Event.DRAWSTART, obj => {
      if (obj['layerType'] === 'rectangle') {
        this.map.eachLayer( l => {
          if (l['options'].className === 'previewBbox') {
            this.map.removeLayer(l);
          }
        });
      }
    });

    // add feature in the map
    this.map.on(Draw.Event.CREATED, e => {
      if (e['layerType'] === 'rectangle') {
        const layer: any = e['layer'];
        const newLayer = rectangle(layer.getBounds(), {
          color: '#FFF',
          weight: 3,
          fill: false,
          dashArray: '10',
          interactive: false,
          className: 'previewBbox'
        });

        this.map.addLayer(newLayer);
        this.store.dispatch(setBbox(newLayer.getBounds()));
        this.store.dispatch(setPositionMap(newLayer.getBounds()));

      } else if (e['layerType'] === 'polygon') {
        const layer: any = e['layer'];
        layer['options']['className'] = 'drawPolygons';
        drawnItems.addLayer(layer);
      }
    });
  }

  /**
   * active view/remove feature
   */
  private setViewInfo() {
    // add  to delete feature
    this.map.on('contextmenu', async evt => {
      // remove last feature polygon
      this.store.dispatch(removeGroupLayer({
        key: 'attribution',
        prefix: 'feature_selected'
      }));
      this.store.dispatch(setSelectedFeatureRemove({ payload: null }));

      // get infos point
      const latlng = evt['latlng'];
      const point = this.map.latLngToContainerPoint(latlng);
      const size = this.map.getSize();

      
      try {
        var overlayers = this.ls.getOverlayers();
        //get infos Feature by layer (From all Layers)
        for (let i = overlayers.length-1; i >= 0; i--) {
          let layer = overlayers[i];
          const response = await this.ls.getInfoByWMS(
            layer.id, this.map.getBounds().toBBoxString(), point.x, point.y, size.y, size.x);
          
            if (response.features.length > 0) {
  
              // add polygon
              const polygonLayer = new L.GeoJSON(response.features[0] as any, {
                attribution: 'feature_selected'
              }).setStyle({
                weight: 3,
                color: '#006666',
                fillOpacity: 0
              });
              this.map.addLayer(polygonLayer);
              if (response.features[0].properties) {
                this.store.dispatch(setSelectedFeatureRemove({ payload: response.features[0].properties.id }));
              }
              
              this.displayPopup(layer.name, response.features[0].properties, latlng);
              break;
            }
  
        }
       
      } catch(err) {
        this.map.closePopup();
        return;
      }
    });
  }

  /**
   * open popup with infos feature
   */
  public displayPopup(title, contentJSON, latlng) {
    let content = '<table class="view_info-table">';
    content += `<caption>${title}</caption>`;
    Object.keys(contentJSON).forEach(key => {
      if (key !== 'bbox') {
        content += `<tr><td><b>${key}</b></td><td>${contentJSON[key]}</td></tr>`;
      }
    });
    content += '</table>';

    L.popup({ maxWidth: 800})
      .setLatLng(latlng)
      .setContent(content)
      .openOn(this.map);
  }

  /**
   * set the visible layers in the layer component of the map
   */
  private setControlLayers() {
    this.layersControl = {
      baseLayers: {},
      overlays: {}
    };

    // mount base layers
    this.ls.getBaseLayers().forEach( (l: BdcLayer) => {
      if (l.enabled) {
        l.layer.addTo(this.map);
      }
      this.layersControl.baseLayers[l.name] = l.layer;
    });
  }

  public setScaleControl() {
    L.control.scale({
      imperial: false
    }).addTo(this.map);
  }
   /**
   * buscar  área por lat e lon
   */
  private setCoordinatesLatLng(){  
    
     (L.Control  as any).geocoder({     
        position: 'topleft',
        expand: 'click',
        placeholder:'Ex: -7.59122,-59.34494',
        defaultMarkGeocode: false
      }).on('markgeocode', e => {         
        this.map.setView(e.geocode.center,10);
       }).addTo(this.map);
      
   }
   
  /**
   * set Coordinates options in the map
   */
  private setCoordinatesControl() {
       
    (L.control as any).coordinates({
      
      position: 'bottomleft',
      decimals: 5,
      decimalSepergoogle_hybridator: '.',
      labelTemplateLat: 'Lat: {y}',
      labelTemplateLng: '| Lng: {x}',
      enableUserInput: false,
      centerUserCoordinates: false,
      useDMS: false,
      useLatLngOrder: true,
    }).addTo(this.map);
  }

  /**
   * set Geocoder options in the map
   */
  private setGeocoderControl() {
    const searchControl = LE.geosearch().addTo(this.map);
    const vm = this;

    searchControl.on('results', data => {
      vm.map.eachLayer( l => {
        if (l['options'].className === 'previewBbox') {
          vm.map.removeLayer(l);
        }
      });

      for (let i = data.results.length - 1; i >= 0; i--) {
        const newLayer = rectangle(data.results[i].bounds, {
          color: '#FFF',
          weight: 3,
          fill: false,
          dashArray: '10',
          interactive: false,
          className: 'previewBbox'
        });

        vm.map.addLayer(newLayer);
        vm.store.dispatch(setBbox(newLayer.getBounds()));
        vm.store.dispatch(setPositionMap(newLayer.getBounds()));
      }
    });
  }

  /**
   * event used when change Map
   */
  public onMapReady(map: MapLeaflet) {
    this.map = map;
    this.setGeocoderControl();
    this.setCoordinatesControl();
    this.setScaleControl();
    this.setCoordinatesLatLng();
  }
}
