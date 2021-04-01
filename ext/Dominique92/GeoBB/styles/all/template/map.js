// Features de la couche
var layerGeoBBgis = layerVectorURL({
		baseUrl: 'ext/Dominique92/GeoBB/gis.php?limit=300',
		urlSuffix: '',
		strategy: ol.loadingstrategy.bboxLimit,
		receiveProperties: function(properties) {
			properties.copy = 'chemineur.fr';
		},
		noClick: script == 'posting',
		styleOptions: function(properties) {
			const style = {
				// Lines & polygons
				stroke: new ol.style.Stroke({
					color: 'blue',
					width: 3,
				}),
			};
			if (properties.icon)
				// Points
				style.image = new ol.style.Icon({
					src: properties.icon,
					imgSize: [24, 24], // C'est le paramètre miracle qui permet d'afficher sur I.E.
				});
			return style;
		},
		hoverStyleOptions: {
			// Lines & polygons
			stroke: new ol.style.Stroke({
				color: 'red',
				width: 3,
			})
		},
	}),
	marker = layerGeoJson({
		displayPointId: 'marker',
		geoJsonId: 'geojson',
		focus: 16,
		dragPoint: true,
		singlePoint: true,
		styleOptions: {
			image: new ol.style.Icon({
				src: 'assets/MyOl/examples/viseur.png',
			}),
		},
	}),
	map = new ol.Map({
		target: 'map',
		layers: [
			layerGeoBBgis,
			layerRefugesInfo({
				selectorName: 'wri-features',
			}),
			layerPyreneesRefuges({
				selectorName: 'prc-features',
			}),
			layerC2C({
				selectorName: 'c2c-features',
			}),
			layerAlpages({
				selectorName: 'alp-features',
			}),
			layerOverpass({
				selectorName: 'osm-features',
			}),
		],
		controls: controlsCollection({
			baseLayers: layersCollection(),
			controlPermalink: {
				display: script == 'index',
				init: script != 'viewtopic',
			},
		}),
	});

switch (script + '-' + mapType) {
	case 'viewtopic-point':
		map.addLayer( // Cadre définissant la position
			layerGeoJson({
				displayPointId: 'cadre-coords',
				geoJsonId: 'cadre-json',
				focus: 16,
				styleOptions: {
					image: new ol.style.Icon({
						src: 'assets/MyOl/examples/cadre.png',
					}),
				},
			}));
		break;

	case 'viewtopic-line':
		const layer = layerGeoJson({
			geoJsonId: 'cadre-json',
		});
		map.getView().fit(
			layer.getSource().getExtent(), {
				size: map.getSize(),
				padding: [5, 5, 5, 5],
			}
		);
		break;

	case 'posting-point':
		map.addLayer(marker);
		break;

	case 'posting-line':
		map.addLayer(layerGeoJson({
			geoJsonId: 'geojson',
			snapLayers: [layerGeoBBgis],
			titleModify: 'Modification d‘une ligne:\n' +
				'Activer ce bouton (couleur jaune) puis\n' +
				'Cliquer et déplacer un sommet pour modifier une ligne\n' +
				'Cliquer sur un segment puis déplacer pour créer un sommet\n' +
				'Alt+cliquer sur un sommet pour le supprimer\n' +
				'Alt+cliquer sur un segment à supprimer dans une ligne pour la couper\n' +
				'Joindre les extrémités deux lignes pour les fusionner\.n',
			titleLine: 'Création d‘une ligne:\n' +
				'Activer ce bouton (couleur jaune) puis\n' +
				'Cliquer sur la carte et sur chaque point désiré pour dessiner une ligne,\n' +
				'double cliquer pour terminer.\n' +
				'Cliquer sur une extrémité d‘une ligne pour l‘étendre.',
		}));
		break;

	case 'posting-poly':
		map.addLayer(layerGeoJson({
			geoJsonId: 'geojson',
			snapLayers: [layerGeoBBgis],
			titleModify: 'Modification d‘un polygone:\n' +
				'Activer ce bouton (couleur jaune) puis\n' +
				'Cliquer et déplacer un sommet pour modifier un polygone\n' +
				'Cliquer sur un segment puis déplacer pour créer un sommet\n' +
				'Alt+cliquer sur un sommet pour le supprimer\n' +
				'Joindre un sommet de chaque polygone et Alt+cliquer pour les fusionner' +
				'Ctrl+Alt+cliquer sur un polygone pour le supprimer.',
			titlePolygon: 'Création d‘un polygone:\n' +
				'Activer ce bouton (couleur jaune) puis\n' +
				'Cliquer sur la carte et sur chaque point désiré pour dessiner un polygone,\n' +
				'double cliquer pour terminer.\n' +
				'Si le nouveau polygone est entièrement compris dans un autre, il crée un "trou".',
		}));
		break;
}