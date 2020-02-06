import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { Store } from '@ngrx/store';
import { layerGroup } from 'leaflet';
import * as L from 'leaflet';

import { LayerService } from '../../layers/layer.service';
import { BdcOverlayer } from '../../layers/layer.interface';
import { ExploreState } from '../../../explore.state';
import { removeLayers, setLayers } from '../../../explore.action';

@Component({
    selector: 'app-map-opacity-box',
    templateUrl: './box.component.html',
    styleUrls: ['./box.component.scss']
})
export class OpacityBoxComponent implements OnInit {
    
    @Input('show') public showBox: boolean;
    
    @Output() toggleToEmit = new EventEmitter();
    
    public layersTitle = [];
    public layers = {};

    /** base url of geoserver */
    private urlGeoserver = window['__env'].urlGeoserver;
    
    constructor(private ls: LayerService,
        private store: Store<ExploreState>) {}
    
    ngOnInit(): void {
        this.mountListLayers();
    }
    
    public mountListLayers() {
        this.ls.getOverlayers().forEach( (l: BdcOverlayer) => {
            this.layersTitle.push(l.name);
            this.layers[l.name] = {
                opacity: 10
            };
        });
        this.updateOpacityLayers();
    }

    public toggleBox() {
        this.toggleToEmit.emit();
    }

    public updateOpacityLayers() {
        const overlayers = this.ls.getOverlayers().map( l => `overlayers_${l.id}` );
        this.store.dispatch(removeLayers(overlayers));

        setTimeout( _ => {
            this.ls.getOverlayers().forEach( (l: BdcOverlayer) => {
                const layer = L.tileLayer.wms(`${this.urlGeoserver}/forest-monitor/wms`, {
                    layers: `forest-monitor:${l.id}`,
                    format: 'image/png',
                    styles: `forest-monitor:${l.style}`,
                    transparent: true,
                    className: `overlayers_${l.id}`,
                    env: `opacity:${(this.layers[l.name]['opacity']/10).toString()}`
                } as any).setZIndex(9999);
                this.store.dispatch(setLayers([layerGroup([layer])]));
            });
        });
    }
}