package com.pinkrain.monjournal;

import android.content.Intent;
import android.net.Uri;
import androidx.core.content.FileProvider;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Partage d'une copie de sauvegarde du journal (feuille de partage Android). */
@CapacitorPlugin(name = "MonJournalFiles")
public class MonJournalFilesPlugin extends Plugin {

    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    @PluginMethod
    public void share(PluginCall call) {
        final String name = call.getString("name", "mon-journal.json").replaceAll("[^A-Za-z0-9._-]", "_");
        final String content = call.getString("content", "");
        executor.execute(() -> {
            try {
                File dir = new File(getContext().getCacheDir(), "exports");
                dir.mkdirs();
                File file = new File(dir, name);
                try (FileOutputStream out = new FileOutputStream(file)) {
                    out.write(content.getBytes(StandardCharsets.UTF_8));
                }
                Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);
                Intent send = new Intent(Intent.ACTION_SEND);
                send.setType("application/json");
                send.putExtra(Intent.EXTRA_STREAM, uri);
                send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                Intent chooser = Intent.createChooser(send, "Enregistrer une copie de Mon Journal");
                chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getActivity().runOnUiThread(() -> {
                    getContext().startActivity(chooser);
                    call.resolve();
                });
            } catch (Exception e) {
                call.reject("Impossible de préparer la copie : " + e.getMessage(), e);
            }
        });
    }
}
