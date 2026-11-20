// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 ParentTree contributors
using System.IO.Compression;
using System.Reflection;
using System.Text;
using System.Text.Json.Nodes;
using ParentTree;

const string original = """{"version":"1.0","metadata":{"title":"Test / Tree","treeId":"legacy-record","archivedAt":"old"},"nodes":[{"id":"person","data":{"label":"Name"}}],"edges":[]}""";
var detached=LocalDocument.Detached(original);
var tree=JsonNode.Parse(detached)!;
if(tree["metadata"]!["treeId"] is not null || tree["metadata"]!["archivedAt"] is not null ||
   tree["nodes"]!.AsArray().Count!=1)throw new Exception("Local identity/data preservation failed");
if(!original.Contains("legacy-record"))throw new Exception("Input changed");
if(LocalDocument.SafeName("Test / Tree").IndexOfAny(Path.GetInvalidFileNameChars())>=0)throw new Exception("Unsafe filename");
var directory=Path.Combine(Path.GetTempPath(),"parenttree-file-test-"+Guid.NewGuid().ToString("N"));
Directory.CreateDirectory(directory);
var file=Path.Combine(directory,"test.fam");
try {
 await LocalDocument.AtomicWriteAsync(file,detached);
 if(await File.ReadAllTextAsync(file)!=detached)throw new Exception("File roundtrip failed");
 await LocalDocument.AtomicWriteAsync(file,detached);
 if(Directory.GetFiles(directory).Length!=1)throw new Exception("Temporary file leaked");
}finally {if(File.Exists(file))File.Delete(file);Directory.Delete(directory);}
if(!OfflineWeb.TryRead("",out var html,out var mime)||!mime.StartsWith("text/html")||!Encoding.UTF8.GetString(html).Contains("assets/"))
 throw new Exception("Embedded cold-start UI missing");
if(OfflineWeb.TryRead("../index.html",out _,out _))throw new Exception("Traversal accepted");
using var stream=Assembly.GetExecutingAssembly().GetManifestResourceStream("ParentTree.Desktop.OfflineWeb.zip")!;
using var archive=new ZipArchive(stream,ZipArchiveMode.Read);
foreach(var entry in archive.Entries.Where(e=>e.Name.Length>0)){
 if(!OfflineWeb.TryRead(entry.FullName,out var bytes,out _)||bytes.Length==0)throw new Exception("Embedded asset missing");
 if(entry.Name.EndsWith(".fam")||entry.Name.EndsWith(".json")||entry.Name.Contains("clientkey")||entry.Name.StartsWith(".env"))
  throw new Exception("Non-UI file embedded");
}
Console.WriteLine("PASS: detached local identity; file roundtrip/atomic overwrite; safe filenames; full offline UI resources; no data/credential files");
