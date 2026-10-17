// ============================================================
// AgriMatch Mobile App - Worker Registration & Voice Notes
// ============================================================

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

import 'dart:convert';

import 'package:path_provider/path_provider.dart';
import 'package:record/record.dart';
import 'package:audioplayers/audioplayers.dart';

// ============================================================
// Configuration
// ============================================================

const String API_BASE = 'http://10.0.2.2:3000';

const List<String> VILLAGES = [
  'Bamenda',
  'Mankon',
  'Nkwen',
  'Bambili',
  'Bambui',
  'Bafut',
  'Bali',
  'Batibo',
  'Mbengwi',
  'Mbouda',
  'Wum',
  'Kumbo',
  'Fundong',
  'Ndop',
  'Nkambe',
];

const Map<String, String> SKILLS = {
  'harvesting': 'Harvesting',
  'planting': 'Planting',
  'weeding': 'Weeding',
  'tractor': 'Tractor Operation',
};

// ============================================================
// Main App
// ============================================================

void main() {
  runApp(const AgriMatchApp());
}

class AgriMatchApp extends StatelessWidget {
  const AgriMatchApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'AgriMatch',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: Colors.green),
        useMaterial3: true,
      ),
      home: const HomeScreen(),
    );
  }
}

// ============================================================
// SCREEN 1: Home
// ============================================================

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('AgriMatch'),
        backgroundColor: Colors.green[700],
        foregroundColor: Colors.white,
      ),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24.0),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.agriculture, size: 80, color: Colors.green),
              const SizedBox(height: 20),
              const Text(
                'Welcome to AgriMatch',
                style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 8),
              const Text(
                'Connecting farm workers to jobs',
                style: TextStyle(fontSize: 14, color: Colors.grey),
              ),
              const SizedBox(height: 40),
              SizedBox(
                width: double.infinity,
                height: 50,
                child: ElevatedButton.icon(
                  onPressed: () {
                    Navigator.push(
                      context,
                      MaterialPageRoute(builder: (_) => const RegisterScreen()),
                    );
                  },
                  icon: const Icon(Icons.person_add),
                  label: const Text(
                    'Register as Worker',
                    style: TextStyle(fontSize: 16),
                  ),
                ),
              ),
              const SizedBox(height: 16),
              SizedBox(
                width: double.infinity,
                height: 50,
                child: OutlinedButton.icon(
                  onPressed: () {
                    Navigator.push(
                      context,
                      MaterialPageRoute(builder: (_) => const StatusScreen()),
                    );
                  },
                  icon: const Icon(Icons.search),
                  label: const Text(
                    'Check My Status',
                    style: TextStyle(fontSize: 16),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ============================================================
// SCREEN 2: Register Worker (with voice note)
// ============================================================

class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key});

  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final _formKey = GlobalKey<FormState>();
  final _nameController = TextEditingController();
  final _phoneController = TextEditingController();

  String? _selectedVillage;
  String? _selectedSkill;
  bool _submitting = false;

  // -------- Voice note state --------
  final AudioRecorder _recorder = AudioRecorder();
  bool _isRecording = false;
  String? _recordingPath;
  int _recordSeconds = 0;
  bool _hasPermission = false;

  @override
  void initState() {
    super.initState();
    _checkPermission();
  }

  @override
  void dispose() {
    _nameController.dispose();
    _phoneController.dispose();
    _recorder.dispose();
    super.dispose();
  }

  Future<void> _checkPermission() async {
    final granted = await _recorder.hasPermission();
    setState(() => _hasPermission = granted);
    if (!granted) {
      print('[Voice] Microphone permission denied');
    }
  }

  Future<void> _startRecording() async {
    try {
      if (!await _recorder.hasPermission()) {
        _showSnack('Microphone permission not granted');
        return;
      }

      final dir = await getTemporaryDirectory();
      final path =
          '${dir.path}/voice_${DateTime.now().millisecondsSinceEpoch}.m4a';

      await _recorder.start(
        const RecordConfig(encoder: AudioEncoder.aacLc),
        path: path,
      );

      setState(() {
        _isRecording = true;
        _recordingPath = null;
        _recordSeconds = 0;
      });

      _tickTimer();
    } catch (e) {
      _showSnack('Failed to start recording: $e');
    }
  }

  void _tickTimer() async {
    while (_isRecording && mounted) {
      await Future.delayed(const Duration(seconds: 1));
      if (_isRecording && mounted) {
        setState(() => _recordSeconds++);
      }
    }
  }

  Future<void> _stopRecording() async {
    try {
      final path = await _recorder.stop();
      setState(() {
        _isRecording = false;
        _recordingPath = path;
      });
      if (path != null) {
        print('[Voice] Recorded to: $path');
        _showSnack('Voice note recorded ($_recordSeconds s)');
      }
    } catch (e) {
      _showSnack('Failed to stop recording: $e');
    }
  }

  Future<void> _playRecording() async {
    if (_recordingPath == null) return;
    try {
      final player = AudioPlayer();
      await player.play(DeviceFileSource(_recordingPath!));
    } catch (e) {
      _showSnack('Playback error: $e');
    }
  }

  void _deleteRecording() {
    setState(() {
      _recordingPath = null;
      _recordSeconds = 0;
    });
  }

  void _showSnack(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  Future<void> _uploadVoiceNote(String phone) async {
    if (_recordingPath == null) {
      print('[Voice] No recording to upload — path is null');
      return;
    }

    print('[Voice] Starting upload: phone=$phone path=$_recordingPath');

    try {
      // URL-encode the phone so '+' is safely transmitted as %2B
      final encodedPhone = Uri.encodeComponent(phone);
      final uri = Uri.parse('$API_BASE/api/voice-notes/$encodedPhone');
      print('[Voice] Upload URL: $uri');

      final request = http.MultipartRequest('POST', uri);

      request.fields['duration'] = _recordSeconds.toString();
      request.files.add(
        await http.MultipartFile.fromPath('audio', _recordingPath!),
      );

      final response = await request.send();
      final body = await response.stream.bytesToString();

      if (response.statusCode == 201) {
        print('[Voice] SUCCESS: $body');
      } else {
        print('[Voice] FAILED: status=${response.statusCode} body=$body');
      }
    } catch (e) {
      print('[Voice] ERROR: $e');
    }
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    if (_selectedVillage == null || _selectedSkill == null) {
      _showSnack('Please select village and skill');
      return;
    }

    setState(() => _submitting = true);

    try {
      final phone = _phoneController.text.trim();
      final response = await http.post(
        Uri.parse('$API_BASE/api/workers'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'phone': phone,
          'name': _nameController.text.trim(),
          'village': _selectedVillage,
          'skill': _selectedSkill,
        }),
      );

      if (!mounted) return;

      if (response.statusCode == 201) {
        // Upload voice note if one was recorded
        if (_recordingPath != null) {
          await _uploadVoiceNote(phone);
        }

        if (!mounted) return;
        _showSnack('Registration successful!');
        Navigator.pop(context);
      } else {
        final error =
            jsonDecode(response.body)['error'] ?? 'Registration failed';
        _showSnack(error);
      }
    } catch (e) {
      if (!mounted) return;
      _showSnack('Network error: $e');
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Register as Worker'),
        backgroundColor: Colors.green[700],
        foregroundColor: Colors.white,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              TextFormField(
                controller: _nameController,
                decoration: const InputDecoration(
                  labelText: 'Full Name',
                  border: OutlineInputBorder(),
                  prefixIcon: Icon(Icons.person),
                ),
                validator: (v) =>
                    (v == null || v.trim().isEmpty) ? 'Enter your name' : null,
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _phoneController,
                decoration: const InputDecoration(
                  labelText: 'Phone Number',
                  hintText: '+2376XXXXXXXX',
                  border: OutlineInputBorder(),
                  prefixIcon: Icon(Icons.phone),
                ),
                keyboardType: TextInputType.phone,
                validator: (v) =>
                    (v == null || v.trim().isEmpty) ? 'Enter your phone' : null,
              ),
              const SizedBox(height: 16),
              DropdownButtonFormField<String>(
                value: _selectedVillage,
                decoration: const InputDecoration(
                  labelText: 'Village',
                  border: OutlineInputBorder(),
                  prefixIcon: Icon(Icons.location_on),
                ),
                items: VILLAGES
                    .map((v) => DropdownMenuItem(value: v, child: Text(v)))
                    .toList(),
                onChanged: (v) => setState(() => _selectedVillage = v),
                validator: (v) => v == null ? 'Select your village' : null,
              ),
              const SizedBox(height: 16),
              DropdownButtonFormField<String>(
                value: _selectedSkill,
                decoration: const InputDecoration(
                  labelText: 'Main Skill',
                  border: OutlineInputBorder(),
                  prefixIcon: Icon(Icons.work),
                ),
                items: SKILLS.entries
                    .map(
                      (e) =>
                          DropdownMenuItem(value: e.key, child: Text(e.value)),
                    )
                    .toList(),
                onChanged: (v) => setState(() => _selectedSkill = v),
                validator: (v) => v == null ? 'Select your skill' : null,
              ),
              const SizedBox(height: 24),
              _buildVoiceNoteSection(),
              const SizedBox(height: 24),
              SizedBox(
                height: 50,
                child: ElevatedButton(
                  onPressed: _submitting ? null : _submit,
                  child: _submitting
                      ? const CircularProgressIndicator(color: Colors.white)
                      : const Text('Register', style: TextStyle(fontSize: 16)),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildVoiceNoteSection() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        border: Border.all(color: Colors.green.shade300),
        borderRadius: BorderRadius.circular(8),
        color: Colors.green.shade50,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Row(
            children: [
              Icon(Icons.mic, color: Colors.green),
              SizedBox(width: 8),
              Text(
                'Voice Note (Optional)',
                style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
              ),
            ],
          ),
          const SizedBox(height: 8),
          const Text(
            'Record a short introduction. Farmers can listen to it.',
            style: TextStyle(fontSize: 12, color: Colors.black54),
          ),
          const SizedBox(height: 16),
          if (!_hasPermission)
            const Text(
              'Microphone permission not granted.',
              style: TextStyle(color: Colors.red, fontSize: 12),
            )
          else if (_isRecording)
            Row(
              children: [
                const Icon(
                  Icons.fiber_manual_record,
                  color: Colors.red,
                  size: 16,
                ),
                const SizedBox(width: 8),
                Text('Recording... $_recordSeconds s'),
                const Spacer(),
                ElevatedButton.icon(
                  onPressed: _stopRecording,
                  icon: const Icon(Icons.stop),
                  label: const Text('Stop'),
                  style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
                ),
              ],
            )
          else if (_recordingPath != null)
            Row(
              children: [
                const Icon(Icons.check_circle, color: Colors.green, size: 20),
                const SizedBox(width: 8),
                Text('Recorded ($_recordSeconds s)'),
                const Spacer(),
                IconButton(
                  icon: const Icon(Icons.play_arrow, color: Colors.green),
                  onPressed: _playRecording,
                  tooltip: 'Play',
                ),
                IconButton(
                  icon: const Icon(Icons.delete, color: Colors.red),
                  onPressed: _deleteRecording,
                  tooltip: 'Delete',
                ),
              ],
            )
          else
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                onPressed: _startRecording,
                icon: const Icon(Icons.mic),
                label: const Text('Start Recording'),
              ),
            ),
        ],
      ),
    );
  }
}

// ============================================================
// SCREEN 3: Check Status (with voice note playback)
// ============================================================

class StatusScreen extends StatefulWidget {
  const StatusScreen({super.key});

  @override
  State<StatusScreen> createState() => _StatusScreenState();
}

class _StatusScreenState extends State<StatusScreen> {
  final _phoneController = TextEditingController();
  final AudioPlayer _player = AudioPlayer();

  Map<String, dynamic>? _worker;
  Map<String, dynamic>? _voiceNote;
  bool _loading = false;
  bool _playing = false;
  String? _error;

  @override
  void dispose() {
    _phoneController.dispose();
    _player.dispose();
    super.dispose();
  }

  Future<void> _fetchWorker() async {
    final phone = _phoneController.text.trim();
    if (phone.isEmpty) {
      setState(() => _error = 'Please enter a phone number');
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
      _worker = null;
      _voiceNote = null;
    });

    try {
      final encodedPhone = Uri.encodeComponent(phone);
      final response = await http.get(
        Uri.parse('$API_BASE/api/workers/$encodedPhone'),
      );
      if (!mounted) return;

      if (response.statusCode == 200) {
        setState(() => _worker = jsonDecode(response.body));
        await _fetchVoiceNote(phone);
      } else {
        setState(() => _error = 'Worker not found');
      }
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = 'Network error: $e');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _fetchVoiceNote(String phone) async {
    try {
      final encodedPhone = Uri.encodeComponent(phone);
      final response = await http.get(
        Uri.parse('$API_BASE/api/voice-notes/$encodedPhone'),
      );
      if (!mounted) return;
      if (response.statusCode == 200) {
        setState(() => _voiceNote = jsonDecode(response.body));
      }
    } catch (_) {
      // Ignore errors — voice note is optional
    }
  }

  Future<void> _togglePlay() async {
    if (_voiceNote == null) return;

    final filename = _voiceNote!['filePath'];
    final url = '$API_BASE/api/voice-notes/audio/$filename';

    try {
      if (_playing) {
        await _player.stop();
        setState(() => _playing = false);
      } else {
        await _player.play(UrlSource(url));
        setState(() => _playing = true);

        _player.onPlayerComplete.listen((_) {
          if (mounted) setState(() => _playing = false);
        });
      }
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text('Playback error: $e')));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Check My Status'),
        backgroundColor: Colors.green[700],
        foregroundColor: Colors.white,
      ),
      body: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            TextField(
              controller: _phoneController,
              decoration: const InputDecoration(
                labelText: 'Phone Number',
                hintText: '+2376XXXXXXXX',
                border: OutlineInputBorder(),
                prefixIcon: Icon(Icons.phone),
              ),
              keyboardType: TextInputType.phone,
            ),
            const SizedBox(height: 16),
            SizedBox(
              height: 50,
              child: ElevatedButton(
                onPressed: _loading ? null : _fetchWorker,
                child: _loading
                    ? const CircularProgressIndicator(color: Colors.white)
                    : const Text(
                        'Check Status',
                        style: TextStyle(fontSize: 16),
                      ),
              ),
            ),
            const SizedBox(height: 24),
            if (_error != null)
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.red[50],
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(_error!, style: const TextStyle(color: Colors.red)),
              ),
            if (_worker != null) _buildWorkerCard(_worker!),
          ],
        ),
      ),
    );
  }

  Widget _buildWorkerCard(Map<String, dynamic> worker) {
    return Card(
      elevation: 4,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.person, color: Colors.green, size: 32),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    worker['name'] ?? 'Unknown',
                    style: const TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
              ],
            ),
            const Divider(height: 24),
            _infoRow(Icons.location_on, 'Village', worker['village'] ?? '-'),
            const SizedBox(height: 8),
            _infoRow(Icons.work, 'Skill', worker['skill'] ?? '-'),
            const SizedBox(height: 8),
            _infoRow(
              Icons.check_circle,
              'Status',
              (worker['available'] == true) ? 'Available' : 'Busy',
            ),
            if (_voiceNote != null) ...[
              const Divider(height: 24),
              _buildVoiceNotePlayer(),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildVoiceNotePlayer() {
    return Row(
      children: [
        Icon(
          _playing ? Icons.stop_circle : Icons.play_circle,
          color: Colors.green,
          size: 40,
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Voice Introduction',
                style: TextStyle(fontWeight: FontWeight.bold),
              ),
              Text(
                _playing ? 'Playing...' : 'Tap to play',
                style: const TextStyle(fontSize: 12, color: Colors.black54),
              ),
            ],
          ),
        ),
        IconButton(
          icon: Icon(
            _playing ? Icons.stop : Icons.play_arrow,
            color: Colors.green,
          ),
          onPressed: _togglePlay,
        ),
      ],
    );
  }

  Widget _infoRow(IconData icon, String label, String value) {
    return Row(
      children: [
        Icon(icon, size: 20, color: Colors.grey[700]),
        const SizedBox(width: 12),
        Text('$label: ', style: const TextStyle(fontWeight: FontWeight.w600)),
        Expanded(child: Text(value)),
      ],
    );
  }
}
