package com.example.armv7starter;

import android.app.Activity;
import android.os.Bundle;
import android.view.Gravity;
import android.widget.TextView;

public final class MainActivity extends Activity {
    static {
        System.loadLibrary("armv7_starter");
    }

    private static native String message();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        TextView text = new TextView(this);
        text.setText(message());
        text.setTextSize(22);
        text.setGravity(Gravity.CENTER);
        setContentView(text);
    }
}
