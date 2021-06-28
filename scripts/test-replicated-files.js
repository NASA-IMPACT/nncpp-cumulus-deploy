const fs = require('fs');

const readContents = (file) =>
   JSON.parse(fs.readFileSync(file, 'utf-8').trim() || "{}").Contents || [];
const assertEqual = (a, b, msg) =>
   console.assert(a === b, msg, a, b) || a === b;

const sourceFiles = readContents('build/cumulus-map-internal-files.json');
const destFiles = readContents('build/nasa-maap-data-store-files.json');

if (
   !assertEqual(sourceFiles.length, destFiles.length,
      "Different number of files: %d !== %d")
) {
   process.exit(1);
}

console.log(`Testing ${sourceFiles.length} files`);

// Assumes order is maintained
sourceFiles.forEach((sourceFile, idx) => {
   assertEqual(sourceFile.Key, destFiles[idx].Key,
      "Keys are different: \n\t%s\n\t%s");
   assertEqual(sourceFile.ETag, destFiles[idx].ETag,
      "ETags are different: \n\t%s\n\t%s");
   assertEqual(sourceFile.Size, destFiles[idx].Size,
      "Sizes are different: %d !== %d");
   assertEqual('STANDARD_IA', destFiles[idx].StorageClass,
      "Storage class is not %s: %s");
});

console.log('Done testing');
