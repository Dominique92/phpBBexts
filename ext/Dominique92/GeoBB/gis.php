<?php
/**
* Extractions de données géographiques
*
* @copyright (c) Dominique Cavailhez 2015
* @license GNU General Public License, version 2 (GPL-2.0)
*
*/

define('IN_PHPBB', true);
$phpbb_root_path = (defined('PHPBB_ROOT_PATH')) ? PHPBB_ROOT_PATH : '../../../';
$phpEx = substr(strrchr(__FILE__, '.'), 1);
include($phpbb_root_path . 'common.' . $phpEx);

// Start session management
$user->session_begin();
$auth->acl($user->data);
$user->setup();

$forums = request_var ('type', ''); // List of forums to include "1,2,3"
$categories = request_var ('cat', ''); // List of categories of forums to include "1,2,3"
$priority = request_var ('priority', 0); // topic_id à affichage prioritaire
$exclude = request_var ('exclude', 0); // topic_id to exclude
$select = request_var ('select', ''); // Post to display
$limit = request_var ('limit', 100); // Nombre de points maximum
$format = request_var ('format', 'geojson'); // Format de sortie. Par défaut geojson

$bboxs = explode (',', $bbox = request_var ('bbox', '-180,-90,180,90'));
$bbox_sql =
	$bboxs[0].' '.$bboxs[1].','.
	$bboxs[2].' '.$bboxs[1].','.
	$bboxs[2].' '.$bboxs[3].','.
	$bboxs[0].' '.$bboxs[3].','.
	$bboxs[0].' '.$bboxs[1];

$diagBbox = hypot ($bboxs[2] - $bboxs[0], $bboxs[3] - $bboxs[1]); // Hypothènuse de la bbox

// Recherche des points dans la bbox
$sql_array = [
	'SELECT' => [
		'post_subject',
		'post_id',
		't.topic_id',
		'f.forum_id',
		'f.forum_name',
		'forum_image',
		'forum_desc',
		'geo_altitude',
		'ST_AsGeoJSON(geom) AS geo_json',
	],
	'FROM' => [POSTS_TABLE => 'p'],
	'LEFT_JOIN' => [[
		'FROM' => [TOPICS_TABLE => 't'],
		'ON' => 't.topic_id = p.topic_id',
	],[
		'FROM' => [FORUMS_TABLE => 'f'],
		'ON' => 'f.forum_id = p.forum_id',
	]],
	'WHERE' => [
		$forums ? "f.forum_id IN ($forums)" : 'TRUE',
		$categories ? "f.parent_id IN ($categories)" : 'TRUE',
		't.topic_id != '.$exclude,
		'geom IS NOT NULL',
		"Intersects (GeomFromText ('POLYGON (($bbox_sql))',4326),geom)",
		'post_visibility = '.ITEM_APPROVED,
		'OR' => [
			'forum_desc REGEXP ":point|:line|:poly"', // Has map
			'(forum_desc REGEXP ".point|.line|.poly" AND t.topic_first_post_id = p.post_id)', // Only map on the first topic
		],
	],
	'ORDER_BY' => "CASE WHEN f.forum_id = $priority THEN 0 ELSE left_id END",
];

if ($select)
	$sql_array['WHERE'] = array_merge ($sql_array['WHERE'], explode (',', $select));

// Build query
if (is_array ($sql_array ['SELECT']))
	$sql_array ['SELECT'] = implode (',', $sql_array ['SELECT']);

if (is_array ($sql_array ['WHERE'])) {
	foreach ($sql_array ['WHERE'] AS $k=>&$w)
		if (is_array ($w))
			$sql_array ['WHERE'][$k] = '('.implode (" $k ", $w).')';
	$sql_array ['WHERE'] = implode (' AND ', $sql_array ['WHERE']);
}

$sql = $db->sql_build_query('SELECT', $sql_array);
$result = $db->sql_query_limit($sql, $limit);

// Ajoute l'adresse complète aux images d'icones
$request_scheme = explode ('/', getenv('REQUEST_SCHEME'));
$request_uri = explode ('/ext/', getenv('REQUEST_URI'));
$url_base = $request_scheme[0].'://'.getenv('SERVER_NAME').$request_uri[0].'/';

$data = $features = $signatures = [];
$ampl = 0x100; // Max color delta
while ($row = $db->sql_fetchrow($result)) {
	// Color calculation
	preg_match_all('/[0-9\.]+/',$row['geo_json'],$coords);
	$x[0] = $coords[0][0] * 30000 % $ampl; // From lon
	$x[1] = $coords[0][1] * 30000 % $ampl; // From lat
	$x[2] = $ampl - ($x[0] + $x[1]) / 2;
	$color = '#';
	for ($c = 0; $c < 3; $c++) // Chacune des 3 couleurs primaires
		$color .= substr (dechex (0x100 + $x[$c]), -2); // 0x100 for left hex 0 / the 2 last hex int chars

	$properties = [
		'name' => $row['post_subject'],
		'link' => $url_base.'viewtopic.php?t='.$row['topic_id'],
		'id' => $row['topic_id'],
		'type_id' => $row['forum_id'],
		'post_id' => $row['post_id'],
		'icon' => $row['forum_image'] ? $url_base .str_replace ('.png', '.svg', $row['forum_image']) : null,
		'color' => $color,
	];

	// Disjoin points having the same coordinate
	$geophp = json_decode ($row['geo_json']);
	if ($geophp->type == 'Point') {
		while (in_array (signature ($geophp->coordinates), $signatures))
			$geophp->coordinates[0] += 0.00001;
		$signatures[] = signature ($geophp->coordinates);
	}

	// geoJson
	$features[] = [
		'type' => 'Feature',
		'geometry' => $geophp, // On ajoute le tout à la liste à afficher sous la forme d'un "Feature" (Sous forme d'objet PHP)
		'properties' => $properties,
	];

	// GML
	$data [] = array_merge ($row, $properties);
}
$db->sql_freeresult($result);

function signature ($coord) {
	return round ($coord[0], 5).'_'.round ($coord[1], 5);
}

// Formatage du header
$secondes_de_cache = 10;
$ts = gmdate("D, d M Y H:i:s", time() + $secondes_de_cache) . " GMT";
header("Content-Transfer-Encoding: binary");
header("Pragma: cache");
header("Expires: $ts");
header("Access-Control-Allow-Origin: *");
header("Cache-Control: max-age=$secondes_de_cache");

switch ($format) {
	case 'gml':
		header("Content-Type: application/gml+xml; UTF-8");
		header("Content-disposition: filename=chemineur.gml");

		echo "<?xml version=\"1.0\" encoding=\"ISO-8859-1\"?>
<wfs:FeatureCollection
	xmlns:wfs=\"http://www.opengis.net/wfs\"
	xmlns:gml=\"http://www.opengis.net/gml\"
	xmlns:topp=\"http://www.openplans.org/topp\"
>
	<name>chemineur.gml</name>
	<description>Points provenants du site chemineur.fr</description>
";

		foreach ($data AS $d) {
			preg_match ('/\[([0-9\.]+,[0-9\.]+)\]/', str_replace (' ', '', json_encode ($d['geo_json'])), $ll);
			echo "
	<gml:featureMember>
		<point>
			<nom>{$d['post_subject']}</nom>
			<type>{$d['forum_name']}</type>
			<site>chemineur.fr</site>
			<gml:Point>
				<gml:coordinates decimal=\".\" cs=\",\" ts=\" \">{$ll[1]}</gml:coordinates>
			</gml:Point>
			<altitude>{$d['geo_altitude']}</altitude>
			<url>{$d['link']}</url>
		</point>
	</gml:featureMember>
";
		}

		echo "
</wfs:FeatureCollection>";
		break;

	default:
		header("Content-Type: application/json; UTF-8");
		header("Content-disposition: filename=geobb.json");

		// On transforme l'objet PHP en code geoJson
		echo json_encode ([
			'type' => 'FeatureCollection',
			'timestamp' => date('c'),
			'features' => $features,
		]);
}