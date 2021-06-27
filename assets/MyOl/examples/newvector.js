// Vector layer
function layerJson(options) {
	options = Object.assign({
		urlSuffix: '',
		styleOptionsFunction: function(so) {
			return so;
		},
	}, options);

	//	options.styleOptions
	//	options.hoverStyleOptions

	options.labelStyleOptions = Object.assign({
		textBaseline: 'bottom',
		offsetY: -13, // Compensate bottom
		padding: [1, 3, 0, 3],
		font: '14px Calibri,sans-serif',
		backgroundFill: new ol.style.Fill({
			color: 'yellow',
		}),
	}, options.labelStyleOptions);

	options.clusterStyleOptions = Object.assign({
		image: new ol.style.Circle({
			radius: 14,
			stroke: new ol.style.Stroke({
				color: 'blue',
			}),
			fill: new ol.style.Fill({
				color: 'white',
			}),
		}),
		text: new ol.style.Text({
			font: '14px Calibri,sans-serif',
		}),
	}, options.clusterStyleOptions);

	//TODO bug sur XMLHttpRequest.Lu.s.onload / n.getCoordinates is not a function
	const source = new ol.source.Vector({
			format: new ol.format.GeoJSON(),
			strategy: options.urlBbox ? ol.loadingstrategy.bbox : ol.loadingstrategy.all,
			url: function(extent, resolution, projection) {
				//TODO Retreive checked parameters
				/*			let list = permanentCheckboxList(options.selectorName).filter(
									function(evt) {
										return evt !== 'on'; // Except the "all" input (default value = "on")
									}),*/

				//TODO une seule fonction intégrant bbox et appel baseurl
				return options.urlBase + // url base that can varry (server name, ...)
					options.urlSuffix + // url suffix to be defined separately from the urlBase
					(!options.urlBbox ? '' :
						options.urlBbox(ol.proj.transformExtent(
							extent,
							projection.getCode(),
							'EPSG:4326' // Received projection
						))
					);
			},
		}),

		style = function(feature) {
			// Memo the options in the feature for hover display
			feature.options = options;

			const features = feature.get('features') || [feature];

			// Single feature (point, line or poly)
			if (features.length == 1) {
				const styleOptions = Object.assign({}, options.styleOptions),
					labelStyleOptions = Object.assign({}, options.labelStyleOptions),
					icon = features[0].get('icon');

				// Add icon on points
				if (icon)
					styleOptions.image = new ol.style.Icon({
						src: icon,
					});

				//TODO ne pas afficher label sur ligne
				labelStyleOptions.text = features[0].get('name');
				styleOptions.text = new ol.style.Text(labelStyleOptions);

				return new ol.style.Style(
					options.styleOptionsFunction(styleOptions, feature)
				);
			}

			//Cluster
			else {
				const clusterStyleOptions = Object.assign({}, options.clusterStyleOptions);

				clusterStyleOptions.text.setText(features.length.toString());
				return new ol.style.Style(clusterStyleOptions);
			}
		},

		clusterSource = !options.clusterDistance ?
		source :
		new ol.source.Cluster({
			distance: options.clusterDistance,
			source: source,
			geometryFunction: function(feature) {

				// If it's a point
				if (!ol.extent.getArea(feature.getGeometry().getExtent()))
					return feature.getGeometry();

				// Then, it's line or poly (not to be clustered)
				// Test if the feature is already included
				const featureExists = clusterSource.forEachFeature(function(f) {
					if (feature.ol_uid == f.ol_uid)
						return true;
				});

				// Include the feature in the cluster source (lines, polygons)
				if (!featureExists)
					clusterSource.addFeature(feature);

				return null; // Don't cluster it
			},
		}),

		layer = new ol.layer.Vector({
			source: clusterSource,
			style: style,
		});

	layer.options = options;

	// Normalize properties
	if (typeof options.normalize == 'function')
		source.on('featuresloadend', function(evt) {
			for (let k in evt.features)
				options.normalize(evt.features[k], layer);
		});

	// Erase the layer before rebuild when bbox strategy is applied
	source.on('featuresloadend', function() {
		source.clear();
	});

	// Tune the clustering distance following the zoom leval
	let pixelRatio = 0;

	layer.on('prerender', function(evt) {
		// Get the transform ratio from the layer frameState
		const ratio = evt.frameState.pixelToCoordinateTransform[0];

		if (pixelRatio != ratio) { // Only when changed
			pixelRatio = ratio;

			// Tune the clustering distance depending on the transform ratio
			if (typeof clusterSource.setDistance == 'function')
				clusterSource.setDistance(Math.max(8, Math.min(60, ratio)));

			// Switch to another layer above a zoom limit
			if (ratio > options.pixelRatioMax) {
				layer.setSource(options.layerAbove.getSource());
				layer.setStyle(options.layerAbove.getStyle());
			} else {
				layer.setSource(clusterSource);
				layer.setStyle(style);
			}
		}
	});

	return layer;
}

/**
 * Control to display labels on hovering a feature & execute click
 * feature.properties.name : name to label the feature
 * feature.properties.link : link to call when click on the feature
 */
function controlHover() {
	let control = new ol.control.Control({
			element: document.createElement('div'), //HACK No button
		}),
		hoveredFeature;

	const hoverLayer = new ol.layer.Vector({
		source: new ol.source.Vector(),
		zIndex: 1, // Above the features

		style: function(feature) {
			const features = feature.get('features') || [feature],
				names = [];

			if (features.length > 1) // Clusters
				for (let f in features)
					names.push(features[f].get('name'));
			else
				names.push(features[0].get('label') || features[0].get('name'));

			const hoverStyleOptions = Object.assign({}, feature.options.hoverStyleOptions),
				labelStyleOptions = Object.assign({}, feature.options.labelStyleOptions);

			labelStyleOptions.text = names.join('\n');
			hoverStyleOptions.text = new ol.style.Text(
				labelStyleOptions
			);
			return new ol.style.Style(hoverStyleOptions);
		},
	});

	control.setMap = function(map) { //HACK execute actions on Map init
		ol.control.Control.prototype.setMap.call(this, map);

		map.addLayer(hoverLayer);

		// Hovering a feature
		map.on('pointermove', function(evt) {
			// Get hovered feature
			const pixel = map.getEventPixel(evt.originalEvent),
				feature = map.forEachFeatureAtPixel(pixel, function(feature) {
					return feature;
				});

			if (feature !== hoveredFeature) {
				if (hoveredFeature)
					hoverLayer.getSource().removeFeature(hoveredFeature);

				if (feature)
					hoverLayer.getSource().addFeature(feature);

				map.getViewport().style.cursor = feature ? 'pointer' : 'default';
				hoveredFeature = feature;
			}
		});

		// Click action
		map.on('click', function(evt) {
			// Get hovered feature
			let feature = map.forEachFeatureAtPixel(evt.pixel, function(feature) {
				return feature;
			});

			if (feature) {
				const center = feature.getGeometry().getCoordinates(),
					features = feature.get('features');
				if (features)
					feature = features[0];
				const link = feature.get('link');

				// Cluster
				if (features && features.length > 1)
					map.getView().animate({
						zoom: map.getView().getZoom() + 1,
						center: center,
					});

				// Point, line, poly
				else if (link) {
					if (evt.originalEvent.ctrlKey) {
						const tab = window.open(link, '_blank');
						if (evt.originalEvent.shiftKey)
							tab.focus();
					} else
						window.location = link;
				}
			}
		});
	};

	return control;
}

function layerChem(options) {
	return layerJson(Object.assign({
		urlBase: '//chemineur.fr/',
		urlSuffix: 'ext/Dominique92/GeoBB/gis.php?cat=8,64&bbox=',
		//urlSuffix: 'ext/Dominique92/GeoBB/gis.php?cat=64&bbox=',
		//urlSuffix: 'ext/Dominique92/GeoBB/gis.php?cat=8&bbox=',
		urlBbox: function(bbox) {
			return bbox.join(',');
		},
		clusterDistance: 32,
		styleOptions: {
			stroke: new ol.style.Stroke({
				color: 'blue',
				width: 2,
			}),
		},
		hoverStyleOptions: {
			stroke: new ol.style.Stroke({
				color: 'red',
				width: 3,
			}),
		},
	}, options));
}

function layerWRI(options) {
	const layerMassif = layerJson({
		urlBase: '//www.refuges.info/',
		urlSuffix: 'api/polygones?type_polygon=1',
		normalize: function(f) {
			f.set('link', f.get('lien'));
			f.set('name', f.get('nom'));
		},
		styleOptionsFunction: function(styleOptions, feature) {
			styleOptions.fill = new ol.style.Fill({
				color: feature.get('couleur'),
			});
			return styleOptions;
		},
	});

	options = Object.assign({
		urlBase: '//www.refuges.info/',
		urlSuffix: 'api/bbox?nb_points=all&type_points=7,10,9,23,6,3,28&bbox=',
		urlBbox: function(bbox) {
			return bbox.join(',');
		},
		clusterDistance: 32,
		pixelRatioMax: 100,
		layerAbove: layerMassif,

		normalize: function(f, layer) {
			// Hover label
			const label = [],
				desc = [];
			if (f.get('type').valeur)
				label.push(
					f.get('type').valeur.replace(
						/(^\w|\s\w)/g,
						function(m) {
							return m.toUpperCase();
						}
					));
			if (f.get('coord').alt)
				desc.push(f.get('coord').alt + 'm');
			if (f.get('places').valeur)
				desc.push(f.get('places').valeur + '\u255E\u2550\u2555');
			if (desc.length)
				label.push(desc.join(', '));
			label.push(f.get('nom'));
			f.set('label', label.join('\n'));

			// Other displays
			f.set('name', f.get('nom'));
			f.set('link', f.get('lien'));
			f.set('icon', layer.options.urlBase + 'images/icones/' + f.get('type').icone + '.svg');
		},
	}, options);

	return layerJson(options);
}

/**
 * Example
 */
const map = new ol.Map({
	target: 'map',
	controls: [
		controlLayerSwitcher({
			baseLayers: layersCollection(),
		}),
		new ol.control.Attribution(),
		controlMousePosition(),
		new ol.control.Zoom(),
		controlFullScreen(),
		controlHover(),
	],
	view: new ol.View({
		//center: [700000, 5700000], // Maurienne
		//center: [260000, 6250000], // Paris
		center: [257000, 6250000], // Paris
		zoom: 9, // 11
	}),
});

map.addLayer(layerWRI());
map.addLayer(layerChem());