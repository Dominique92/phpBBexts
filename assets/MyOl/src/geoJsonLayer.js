// Vector layer
function geoJsonLayer(options) {
	options = Object.assign({
		urlSuffix: '',
		styleOptionsFunction: function(styleOptions) {
			return styleOptions;
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
	//TODO gérer les msg erreur
	const source = new ol.source.Vector({
			format: new ol.format.GeoJSON(),
			strategy: options.urlBbox ? ol.loadingstrategy.bbox : ol.loadingstrategy.all,
			url: function(extent, resolution, projection) {
				//TODO Retreive checked parameters
				/* let list = permanentCheckboxList(options.selectorName).filter(
					function(evt) {
						return evt !== 'on'; // Except the "all" input (default value = "on")
					}
				),*/

				//TODO une seule fonction intégrant bbox et appel baseurl
				return options.urlBase + // url base that can vary (server name, ...)
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

		// Optional clusterisation
		clusterSource = !options.clusterDistance ? source :
		new ol.source.Cluster({
			distance: options.clusterDistance,
			source: source,
			geometryFunction: function(feature) {
				// Generate a center point at to manage clusterisations
				return new ol.geom.Point(
					ol.extent.getCenter(
						feature.getGeometry().getExtent()
					)
				);
			},
		}),

		layer = new ol.layer.Vector({
			source: clusterSource,
			style: style,
		});

	// Memorize for further use
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

	// Define the style of the cluster point & the groupped features
	function style(feature) {
		const features = feature.get('features') || [feature],
			icon = features[0].get('icon'),
			area = ol.extent.getArea(
				features[0].getGeometry().getExtent()
			),
			styleOptions = Object.assign({}, options.styleOptions),
			labelStyleOptions = Object.assign({}, options.labelStyleOptions);

		feature.options = options; // Memorize the options in the feature for hover display

		// Clusters
		if (features.length > 1) {
			const clusterStyleOptions = Object.assign({}, options.clusterStyleOptions);

			clusterStyleOptions.text.setText(features.length.toString());

			return new ol.style.Style(clusterStyleOptions);
		}

		// Single feature (point, line or poly)

		// Add a permanent label
		labelStyleOptions.text = features[0].get('name');
		styleOptions.text = new ol.style.Text(labelStyleOptions);

		// Include the feature in the cluster source (lines, polygons)
		// to make it visible
		if (area) {
			const featureExists = clusterSource.forEachFeature(function(f) {
				if (features[0].ol_uid == f.ol_uid)
					return true;
			});

			if (!featureExists)
				clusterSource.addFeature(features[0]);
		}

		// Add icon if one is defined in the properties
		else if (icon)
			styleOptions.image = new ol.style.Icon({
				src: icon,
			});

		return new ol.style.Style(
			options.styleOptionsFunction(styleOptions, feature)
		);
	}

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

			// Big clusters
			if (features.length > 5)
				names.push(features.length + ' éléments');

			// Clusters
			else if (features.length > 1)
				for (let f in features)
					names.push(features[f].get('name'));

			// Point
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
			let pixel = map.getEventPixel(evt.originalEvent), //TODO let -> const ?
				feature = map.forEachFeatureAtPixel(pixel, function(feature) {
					return feature;
				});

			if (feature) {
				const features = feature.get('features') || [feature];
				if (features.length == 1) {
					const options = feature.options;
					feature = features[0];
					features[0].options = options;
				}
			}

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