import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { SongService } from './song.service';
import { provideHttpClient, withInterceptorsFromDi, withXhr } from '@angular/common/http';

describe('SongService', () => {
  let service: SongService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [],
      providers: [provideHttpClient(withXhr(), withInterceptorsFromDi()), provideHttpClientTesting()],
    });
    service = TestBed.inject(SongService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('loads and parses every song from the generated index', done => {
    service.loadSongs().subscribe(songs => {
      expect(songs.length).toBe(1);
      expect(songs[0].meta.title).toBe('Piosenka');
      expect(songs[0].blocks[0].lines[1].rawChords).toBe('C');
      done();
    });

    http.expectOne('assets/songs-index.json').flush({ songs: ['one.txt'] });
    http.expectOne('songs/one.txt').flush('{title}Piosenka\n{author}Ktoś\n\n\nlinia 1|C\nlinia 2');
  });

  it('sorts the songs alphabetically by title, not by file name', done => {
    service.loadSongs().subscribe(songs => {
      expect(songs.map(song => song.meta.title)).toEqual(['Ale', 'Żubr']);
      done();
    });

    http.expectOne('assets/songs-index.json').flush({ songs: ['a.txt', 'b.txt'] });
    http.expectOne('songs/a.txt').flush('{title}Żubr\n{author}X\n\nlinia|C');
    http.expectOne('songs/b.txt').flush('{title}Ale\n{author}X\n\nlinia|C');
  });

  it('finds songs inside subdirectories', done => {
    service.loadSongs().subscribe(songs => {
      expect(songs[0].sourceFile).toEqual('koledy/cicha-noc.txt');
      done();
    });

    http.expectOne('assets/songs-index.json').flush({ songs: ['koledy/cicha-noc.txt'] });
    http.expectOne('songs/koledy/cicha-noc.txt').flush('{title}Cicha noc\n{author}X\n\nlinia|C');
  });

  it('returns an empty list when the index is empty', done => {
    service.loadSongs().subscribe(songs => {
      expect(songs).toEqual([]);
      done();
    });
    http.expectOne('assets/songs-index.json').flush({ songs: [] });
  });
});
