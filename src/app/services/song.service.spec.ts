import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { SongService } from './song.service';

describe('SongService', () => {
  let service: SongService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });
    service = TestBed.inject(SongService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('loads and parses every song from __songs__.txt', done => {
    service.loadSongs().subscribe(songs => {
      expect(songs.length).toBe(1);
      expect(songs[0].meta.title).toBe('Piosenka');
      expect(songs[0].blocks[0].lines[1].rawChords).toBe('C');
      done();
    });

    http.expectOne('assets/__songs__.txt').flush('one.txt\n');
    http.expectOne('assets/one.txt').flush('{title}Piosenka\n\n\nlinia 1|C\nlinia 2');
  });

  it('returns an empty list when nothing is listed', done => {
    service.loadSongs().subscribe(songs => {
      expect(songs).toEqual([]);
      done();
    });
    http.expectOne('assets/__songs__.txt').flush('');
  });
});
