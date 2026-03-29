import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:window_manager/window_manager.dart';

const _noteKey = 'pinstick-note';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await windowManager.ensureInitialized();

  WindowOptions windowOptions = const WindowOptions(
    size: Size(420, 320),
    center: true,
    title: 'PinStick',
  );
  await windowManager.waitUntilReadyToShow(windowOptions, () async {
    await windowManager.show();
    await windowManager.focus();
  });

  runApp(const PinStickApp());
}

class PinStickApp extends StatelessWidget {
  const PinStickApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'PinStick',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: Colors.indigo),
        useMaterial3: true,
      ),
      home: const PinStickHome(),
    );
  }
}

class PinStickHome extends StatefulWidget {
  const PinStickHome({super.key});

  @override
  State<PinStickHome> createState() => _PinStickHomeState();
}

class _PinStickHomeState extends State<PinStickHome> {
  final TextEditingController _controller = TextEditingController();
  bool _pinned = false;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final prefs = await SharedPreferences.getInstance();
    final text = prefs.getString(_noteKey) ?? '';
    final isPinned = await windowManager.isAlwaysOnTop();
    setState(() {
      _controller.text = text;
      _pinned = isPinned;
      _loading = false;
    });
  }

  Future<void> _togglePin() async {
    final next = !_pinned;
    await windowManager.setAlwaysOnTop(next);
    setState(() => _pinned = next);
  }

  Future<void> _save(String value) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_noteKey, value);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('PinStick'),
        actions: [
          IconButton(
            tooltip: _pinned ? 'Unpin window' : 'Pin window',
            icon: Icon(_pinned ? Icons.push_pin : Icons.push_pin_outlined),
            onPressed: _loading ? null : _togglePin,
          ),
        ],
      ),
      body: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          children: [
            if (_loading) const LinearProgressIndicator(),
            Expanded(
              child: TextField(
                controller: _controller,
                maxLines: null,
                expands: true,
                decoration: const InputDecoration(
                  border: OutlineInputBorder(),
                  hintText: 'Type your notes here…',
                ),
                style: const TextStyle(fontFamily: 'monospace'),
                onChanged: _save,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
