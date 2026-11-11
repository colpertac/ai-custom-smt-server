// Headless dump helper for the IMAGINE avatar renderer research.
//
// Modes (pass as -postScript Dump.java <mode> <out> ...):
//   decomp  <outDir> <depth> <addr>...   decompile functions containing each addr, plus callees
//                                        up to <depth> levels; one .c file per function + index.txt
//   xrefs   <outFile> <addr>...          references to each address, with the containing function
//   strings <outFile> <substr>...        defined strings containing substr (case-insensitive) + xrefs
//   label   <outFile> <addr> <name>...   rename functions (pairs of addr name); needs a writable project
//@category IMAGINE

import java.io.File;
import java.io.PrintWriter;
import java.util.*;

import ghidra.app.decompiler.DecompInterface;
import ghidra.app.decompiler.DecompileResults;
import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.Address;
import ghidra.program.model.listing.Data;
import ghidra.program.model.listing.DataIterator;
import ghidra.program.model.listing.Function;
import ghidra.program.model.symbol.Reference;
import ghidra.program.model.symbol.SourceType;

public class Dump extends GhidraScript {

  @Override
  protected void run() throws Exception {
    String[] args = getScriptArgs();
    if (args.length < 2) {
      printerr("usage: Dump.java <decomp|xrefs|strings|label> <out> ...");
      return;
    }
    switch (args[0]) {
      case "decomp": decomp(args); break;
      case "xrefs": xrefs(args); break;
      case "strings": strings(args); break;
      case "label": label(args); break;
      default: printerr("unknown mode " + args[0]);
    }
  }

  private Function resolve(Function f) {
    while (f != null && f.isThunk()) {
      Function t = f.getThunkedFunction(false);
      if (t == null || t == f) break;
      f = t;
    }
    return f;
  }

  private String fname(Function f) {
    return f.getName() + "@" + f.getEntryPoint();
  }

  private void decomp(String[] args) throws Exception {
    File dir = new File(args[1]);
    dir.mkdirs();
    int depth = Integer.parseInt(args[2]);
    DecompInterface di = new DecompInterface();
    di.openProgram(currentProgram);
    Map<Function, Integer> seen = new LinkedHashMap<>();
    Deque<Function> queue = new ArrayDeque<>();
    for (int i = 3; i < args.length; i++) {
      Address a = toAddr(args[i]);
      Function f = resolve(getFunctionContaining(a));
      if (f == null) {
        println("no function at " + args[i]);
        continue;
      }
      if (!seen.containsKey(f)) {
        seen.put(f, 0);
        queue.add(f);
      }
    }
    try (PrintWriter index = new PrintWriter(new File(dir, "index.txt"))) {
      while (!queue.isEmpty() && !monitor.isCancelled()) {
        Function f = queue.poll();
        int d = seen.get(f);
        StringBuilder sb = new StringBuilder();
        sb.append("// ").append(fname(f)).append("  depth=").append(d).append("\n// callers:");
        for (Reference r : getReferencesTo(f.getEntryPoint())) {
          Function c = getFunctionContaining(r.getFromAddress());
          sb.append(" ").append(c == null ? r.getFromAddress().toString() : fname(c));
        }
        sb.append("\n// callees:");
        Set<Function> callees = f.getCalledFunctions(monitor);
        for (Function c : callees) sb.append(" ").append(fname(resolve(c)));
        sb.append("\n\n");
        DecompileResults res = di.decompileFunction(f, 90, monitor);
        if (res != null && res.decompileCompleted()) {
          sb.append(res.getDecompiledFunction().getC());
        } else {
          sb.append("// decompile failed: ").append(res == null ? "null" : res.getErrorMessage());
        }
        String file = "FUN_" + f.getEntryPoint() + ".c";
        try (PrintWriter w = new PrintWriter(new File(dir, file))) {
          w.print(sb);
        }
        index.println(d + "\t" + fname(f) + "\t" + file);
        if (d < depth) {
          for (Function c : callees) {
            Function rc = resolve(c);
            if (rc == null || rc.isExternal() || seen.containsKey(rc)) continue;
            seen.put(rc, d + 1);
            queue.add(rc);
          }
        }
      }
    }
    di.dispose();
    println("decompiled " + seen.size() + " functions into " + dir);
  }

  private void xrefs(String[] args) throws Exception {
    try (PrintWriter w = new PrintWriter(new File(args[1]))) {
      for (int i = 2; i < args.length; i++) {
        Address a = toAddr(args[i]);
        w.println("== " + a);
        for (Reference r : getReferencesTo(a)) {
          Function c = getFunctionContaining(r.getFromAddress());
          w.println("  " + r.getFromAddress() + "\t" + r.getReferenceType() + "\t"
              + (c == null ? "-" : fname(c)));
        }
      }
    }
  }

  private void strings(String[] args) throws Exception {
    List<String> needles = new ArrayList<>();
    for (int i = 2; i < args.length; i++) needles.add(args[i].toLowerCase());
    try (PrintWriter w = new PrintWriter(new File(args[1]))) {
      DataIterator it = currentProgram.getListing().getDefinedData(true);
      while (it.hasNext() && !monitor.isCancelled()) {
        Data d = it.next();
        if (!d.hasStringValue()) continue;
        Object v = d.getValue();
        if (v == null) continue;
        String s = v.toString();
        String low = s.toLowerCase();
        boolean hit = false;
        for (String n : needles) if (low.contains(n)) { hit = true; break; }
        if (!hit) continue;
        w.println(d.getAddress() + "\t" + s.replace("\n", "\\n"));
        for (Reference r : getReferencesTo(d.getAddress())) {
          Function c = getFunctionContaining(r.getFromAddress());
          w.println("    <- " + r.getFromAddress() + "\t" + (c == null ? "-" : fname(c)));
        }
      }
    }
  }

  private void label(String[] args) throws Exception {
    try (PrintWriter w = new PrintWriter(new File(args[1]))) {
      for (int i = 2; i + 1 < args.length; i += 2) {
        Function f = getFunctionAt(toAddr(args[i]));
        if (f == null) f = getFunctionContaining(toAddr(args[i]));
        if (f == null) { w.println("no function " + args[i]); continue; }
        f.setName(args[i + 1], SourceType.USER_DEFINED);
        w.println("named " + f.getEntryPoint() + " " + args[i + 1]);
      }
    }
  }
}
