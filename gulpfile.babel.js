import fs from 'fs';
import path from 'path';
import stream from 'stream';
import util from 'util';

import gulp from 'gulp';
import gulpRename from 'gulp-rename';
import gulpInsert from 'gulp-insert';
import gulpFilter from 'gulp-filter';
import gulpReplace from 'gulp-replace';
import gulpSourcemaps from 'gulp-sourcemaps';
import gulpBabel from 'gulp-babel';
import execa from 'execa';
import del from 'del';
import onetime from 'onetime';
import webpack from 'webpack';
import MemoryFs from 'memory-fs';

const readFile = util.promisify(fs.readFile);
const pipeline = util.promisify(stream.pipeline);

// Ugly hack to make Webpack work in older Node versions.
if (!global.BigInt) {
	global.BigInt = Number;
}

async function exec(cmd, args = []) {
	await execa(cmd, args, {
		preferLocal: true,
		stdio: 'inherit'
	});
}

async function packageJSON() {
	return JSON.parse(await readFile('package.json', 'utf8'));
}

async function babelrc() {
	return Object.assign(JSON.parse(await readFile('.babelrc', 'utf8')), {
		babelrc: false
	});
}

const compileWindow = onetime(async () => {
	const filename = 'index.js';
	const compiler = webpack({
		entry: './window/',
		output: {
			library: '_',
			libraryTarget: 'var',
			filename,
			path: '/'
		}
	});
	compiler.outputFileSystem = new MemoryFs();
	await new Promise((resolve, reject) => {
		compiler.run((err, stats) => {
			err = err || (
				stats.hasErrors() ? stats.compilation.errors[0] : null
			);
			if (err) {
				reject(err);
				return;
			}
			resolve();
		});
	});
	const code = compiler.outputFileSystem.data[filename].toString('utf8')
		.replace(/[\s;]+$/, '');
	return `(_=>{${code};return _})()`;
});

async function babelTarget(src, srcOpts, dest, modules) {
	// Change module.
	const babelOptions = await babelrc();
	for (const preset of babelOptions.presets) {
		if (preset[0] === '@babel/preset-env') {
			preset[1].modules = modules;
		}
	}
	if (!modules) {
		babelOptions.plugins.push([
			'esm-resolver', {
				source: {
					extensions: [
						[
							['.js', '.mjs', '.jsx', '.mjsx', '.ts', '.tsx'],
							'.mjs'
						]
					]
				},
				submodule: {
					extensions: ['.mjs', '.js']
				}
			}
		]);
	}

	// Read the package JSON.
	const pkg = await packageJSON();

	// Filter meta data file and create replace transform.
	const filterMeta = gulpFilter([
		'*/meta.ts',
		'*/data.ts'
	], {restore: true});
	const filterMetaReplaces = [
		["'@VERSION@'", JSON.stringify(pkg.version)],
		["'@NAME@'", JSON.stringify(pkg.name)],
		["'@WINDOW@'", JSON.stringify(await compileWindow())]
	].map(v => gulpReplace(...v));

	await pipeline(...[
		gulp.src(src, srcOpts),
		filterMeta,
		...filterMetaReplaces,
		filterMeta.restore,
		gulpSourcemaps.init(),
		gulpBabel(babelOptions),
		gulpRename(path => {
			if (!modules && path.extname === '.js') {
				path.extname = '.mjs';
			}
		}),
		gulpSourcemaps.write('.', {
			includeContent: true,
			addComment: false,
			destPath: dest
		}),
		gulpInsert.transform((contents, file) => {
			// Manually append sourcemap comment.
			if (/\.m?js$/i.test(file.path)) {
				const base = path.basename(file.path);
				return `${contents}\n//# sourceMappingURL=${base}.map\n`;
			}
			return contents;
		}),
		gulp.dest(dest)
	].filter(Boolean));
}

async function eslint(strict) {
	try {
		await exec('eslint', ['.']);
	}
	catch (err) {
		if (strict) {
			throw err;
		}
	}
}

// clean

gulp.task('clean:logs', async () => {
	await del([
		'npm-debug.log*',
		'yarn-debug.log*',
		'yarn-error.log*'
	]);
});

gulp.task('clean:lib', async () => {
	await del([
		'lib'
	]);
});

gulp.task('clean', gulp.parallel([
	'clean:logs',
	'clean:lib'
]));

// lint (watch)

gulp.task('lintw:es', async () => {
	await eslint(false);
});

gulp.task('lintw', gulp.parallel([
	'lintw:es'
]));

// lint

gulp.task('lint:es', async () => {
	await eslint(true);
});

gulp.task('lint', gulp.parallel([
	'lint:es'
]));

// build

gulp.task('build:lib:dts', async () => {
	await exec('tsc');
});

gulp.task('build:lib:cjs', async () => {
	await babelTarget(['src/**/*.ts'], {}, 'lib', 'commonjs');
});

gulp.task('build:lib:mjs', async () => {
	await babelTarget(['src/**/*.ts'], {}, 'lib', false);
});

gulp.task('build:lib', gulp.parallel([
	'build:lib:dts',
	'build:lib:cjs',
	'build:lib:mjs'
]));

gulp.task('build', gulp.parallel([
	'build:lib'
]));

// test

gulp.task('test:node', async () => {
	await exec('jasmine');
});

gulp.task('test', gulp.parallel([
	'test:node'
]));

// all

gulp.task('all', gulp.series([
	'clean',
	'lint',
	'build',
	'test'
]));

// watched

gulp.task('watched', gulp.series([
	'clean',
	'lintw',
	'build',
	'test'
]));

// prepack

gulp.task('prepack', gulp.series([
	'clean',
	'build'
]));

// default

gulp.task('default', gulp.series([
	'all'
]));
