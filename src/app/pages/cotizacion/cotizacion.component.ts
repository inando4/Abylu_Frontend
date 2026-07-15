import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { ReactiveFormsModule, FormsModule, FormBuilder, FormGroup, FormArray, Validators } from '@angular/forms';
import { HeaderComponent } from '../../components/header/header.component';
import { ProductoService, CotizacionService } from '../../core/services';
import { AuthService } from '../../core/services/auth.service';
import { Producto, ProductoPrecioEscala, CrearCotizacionRequest, ItemCotizacionRequest, CotizacionResponse, DetalleResponse } from '../../shared/models';

interface TipoEvento {
  id: string;
  name: string;
  emoji: string;
}

interface CotizacionFormItem {
  productoId: number | null;
  cantidad: number | null;
  esIlimitado: boolean;
  precioUnitarioManual: number | null;
  descripcionManual: string | null;
  esPersonalizado: boolean;
  nombreProducto: string;
}

interface CotizacionFormValue {
  clienteTelefono: string;
  fechaEvento: string;
  tipoEvento: string;
  lugarEvento: string;
  notas: string;
  descuento: number;
  movilidad: number;
  horasServicio: number | string | null;
  items: CotizacionFormItem[];
}

@Component({
  selector: 'app-cotizacion',
  imports: [CommonModule, ReactiveFormsModule, FormsModule, HeaderComponent],
  templateUrl: './cotizacion.component.html',
  styleUrl: './cotizacion.component.css'
})
export class CotizacionComponent implements OnInit {

  private fb = inject(FormBuilder);
  private productoService = inject(ProductoService);
  private cotizacionService = inject(CotizacionService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private auth = inject(AuthService);
  private readonly cantidadDefault = 50;

  productos: Producto[] = [];
  escalas: ProductoPrecioEscala[] = [];

  /** ID de la cotización en modo edición. null = modo creación. */
  cotizacionId: number | null = null;
  /** Número visible de la cotización editada (para títulos/labels). */
  numeroCotizacion = '';

  cargando = false;
  guardandoBorrador = false;
  error = '';

  get modoEdicion(): boolean {
    return this.cotizacionId != null;
  }

  pickerOpen = false;
  /** Texto del buscador del picker. */
  pickerSearch = '';
  confirmOpen = false;
  /** Qué acción confirma el diálogo: generar/descargar PDF o solo guardar borrador. */
  confirmAccion: 'pdf' | 'borrador' = 'pdf';

  readonly tiposEvento: TipoEvento[] = [
    { id: 'cumple',      name: 'Cumpleaños',  emoji: '🎂' },
    { id: 'boda',        name: 'Matrimonio',  emoji: '💍' },
    { id: 'corporativo', name: 'Corporativo', emoji: '🏢' },
    { id: 'baby',        name: 'Baby shower', emoji: '🍼' },
    { id: 'quince',      name: 'Quinceañero', emoji: '👑' },
    { id: 'otros',       name: 'Otros',       emoji: '✨' },
  ];

  private readonly emojisPorProducto: Record<string, string> = {
    'algodón de azúcar en domo': '🍭',
    'helados': '🍦',
    'salchipapa': '🍟',
    'nuggets': '🍗',
    'café': '☕',
    'emoliente frutado': '🍵',
    'pizzetas': '🍕',
    'bebidas personalizadas': '🥤',
    'mini churros rellenos': '🥖',
    'chocolate caliente': '☕',
    'fresas con chocolate': '🍓',
    'fuente de chocolate': '🍫',
    'pan c/ hot dog': '🌭',
    'salchicono': '🍟',
    'popcorn salado': '🍿',
    'manzanas acarameladas': '🍎',
    'yoguis de hot dog': '🌭',
    'candy bar': '🍬',
    'algodón de azúcar': '🍭',
    'mini donas': '🍩',
    'brochetas de pollo': '🍢',
    'mini pancakes': '🥞',
    'waffles': '🧇',
    'dispensador de bebidas': '🥤',
    'fresas con crema': '🍓',
    'hamburguesa + papitas fritas': '🍔',
    'hamburguesa de carne': '🍔',
    'mini hamburguesas': '🍔',
    'fruti bar': '🥭',
    'churro relleno': '🥖',
    'choripan': '🍔',
  };

  cotizacionForm!: FormGroup;

  get items(): FormArray {
    return this.cotizacionForm.get('items') as FormArray;
  }

  get subtotal(): number {
    return this.items.controls.reduce((sum, item) => {
      const subtotalItem = item.get('subtotalItem')?.value || 0;
      return sum + subtotalItem;
    }, 0);
  }

  get total(): number {
    const descuento = +this.cotizacionForm.get('descuento')?.value || 0;
    const movilidad = +this.cotizacionForm.get('movilidad')?.value || 0;
    const total = this.subtotal + movilidad - descuento;
    return total > 0 ? total : 0;
  }

  /** IDs de productos del catálogo ya en el carrito (para deshabilitar tiles). */
  get idsEnCarrito(): number[] {
    return this.items.controls
      .map(c => c.get('productoId')?.value)
      .filter((v): v is number => v != null)
      .map(v => +v);
  }

  /**
   * Productos del picker: filtrados por el buscador y ordenados
   * alfabéticamente para un scroll predecible en una sola columna.
   */
  get productosVisibles(): Producto[] {
    let lista = this.productos;

    const term = this.pickerSearch.trim().toLowerCase();
    if (term) {
      lista = lista.filter(p => p.nombre.toLowerCase().includes(term));
    }

    return [...lista].sort((a, b) =>
      this.nombreCorto(a.nombre).localeCompare(
        this.nombreCorto(b.nombre), 'es', { sensitivity: 'base' }
      )
    );
  }

  ngOnInit(): void {
    this.initForm();
    this.cargarProductos();
    this.cargarEscalas();

    const idParam = this.route.snapshot.paramMap.get('id');
    if (idParam) {
      const id = Number(idParam);
      if (!id || isNaN(id)) {
        this.router.navigate(['/historial']);
        return;
      }
      this.cargarCotizacionParaEditar(id);
    }
  }

  /**
   * Precarga el formulario con los datos de una cotización existente.
   * Depende de que DetalleResponse incluya productoId (null = personalizado).
   */
  private cargarCotizacionParaEditar(id: number): void {
    this.cargando = true;
    this.cotizacionService.buscarPorId(id).subscribe({
      next: (cotizacion) => {
        if (cotizacion.estado === 'ACEPTADA' || cotizacion.estado === 'RECHAZADA') {
          this.router.navigate(['/historial', id]);
          return;
        }
        // Guarda: si el backend aún no expone productoId en DetalleResponse,
        // precargar y guardar convertiría cada ítem del catálogo en manual
        // (e ilimitados a cantidad/precio 0). Bloqueamos la edición hasta entonces.
        if (cotizacion.detalles.some(d => !('productoId' in d))) {
          this.error = 'No se puede editar todavía: el backend debe exponer productoId en DetalleResponse.';
          this.cargando = false;
          return;
        }
        this.precargarFormulario(cotizacion);
        this.cargando = false;
      },
      error: () => {
        this.error = 'No se pudo cargar la cotización para editar.';
        this.cargando = false;
      }
    });
  }

  private precargarFormulario(cotizacion: CotizacionResponse): void {
    this.cotizacionId = cotizacion.id;
    this.numeroCotizacion = cotizacion.numeroCotizacion;

    this.cotizacionForm.patchValue({
      clienteTelefono: cotizacion.clienteTelefono,
      lugarEvento:     cotizacion.lugarEvento,
      tipoEvento:      cotizacion.tipoEvento || '',
      fechaEvento:     cotizacion.fechaEvento,
      notas:           cotizacion.notas || '',
      descuento:       cotizacion.descuento || 0,
      movilidad:       cotizacion.movilidad || 0,
      horasServicio:   cotizacion.horasServicio || '',
    });

    this.items.clear();
    cotizacion.detalles.forEach(det => this.items.push(this.crearGrupoDesdeDetalle(det)));
  }

  /** Reconstruye un FormGroup de ítem desde una línea de DetalleResponse. */
  private crearGrupoDesdeDetalle(det: DetalleResponse): FormGroup {
    const esPersonalizado = det.productoId == null;

    return this.fb.group({
      productoId:           [det.productoId],
      cantidad:             [det.esIlimitado ? null : det.cantidad],
      esIlimitado:          [det.esIlimitado],
      precioUnitarioManual: [det.esIlimitado ? null : det.precioUnitario],
      descripcionManual:    [esPersonalizado ? (det.descripcionManual ?? det.productoNombre) : null],
      esPersonalizado:      [esPersonalizado],
      nombreProducto:       [det.productoNombre],
      precioUnitarioVista:  [det.precioUnitario],
      subtotalItem:         [det.subtotal],
    });
  }

  private initForm(): void {
    this.cotizacionForm = this.fb.group({
      clienteTelefono: ['', Validators.required],
      lugarEvento:     ['', Validators.required],
      tipoEvento:      [''],
      fechaEvento:     ['', Validators.required],
      notas:           [''],
      descuento:       [0, [Validators.required, Validators.min(0)]],
      movilidad:       [0, [Validators.required, Validators.min(0)]],
      horasServicio:   [''],
      items:           this.fb.array([])
    });
  }

  private cargarProductos(): void {
    this.productoService.listarActivos().subscribe({
      next: (data) => this.productos = data,
      error: () => this.error = 'No se pudieron cargar los productos. ¿Está corriendo el backend?'
    });
  }

  private cargarEscalas(): void {
    this.productoService.listarEscalas().subscribe({
      next: (data) => this.escalas = data,
      error: () => console.warn('No se pudieron cargar las escalas de precio')
    });
  }

  private buscarEscala(productoId: number, cantidad: number): ProductoPrecioEscala | undefined {
    return this.escalas.find(e => e.productoId === productoId && e.cantidad === cantidad);
  }

  /** Mapa de emojis por palabra clave del nombre del producto. */
  emojiPara(producto: Producto): string {
    const n = producto.nombre.toLowerCase();
    const emojiExacto = this.emojisPorProducto[n];
    if (emojiExacto) return emojiExacto;

    if (n.includes('hot dog') || n.includes('hotdog')) return '🌭';
    if (n.includes('hamburg')) return '🍔';
    if (n.includes('anticucho')) return '🍢';
    if (n.includes('canchita') || n.includes('popcorn') || n.includes('pop corn')) return '🍿';
    if (n.includes('algod')) return '🍭';
    if (n.includes('postre') || n.includes('waffle') || n.includes('helado')) return '🧇';
    if (n.includes('café') || n.includes('cafe')) return '☕';
    if (n.includes('cóctel') || n.includes('coctel') || n.includes('barra')) return '🍹';
    if (n.includes('piqueo') || n.includes('queso')) return '🧀';
    if (n.includes('bebida') || n.includes('jugo') || n.includes('refresco') || n.includes('dispens')) return '🥤';
    if (n.includes('pizza')) return '🍕';
    if (producto.categoria === 'ilimitado') return '⚡';
    return '🍽️';
  }

  formatCategoria(categoria: string): string {
    if (categoria === 'ilimitado') return 'Ilimitado';
    if (categoria === 'snack') return 'Snack';
    return categoria.charAt(0).toUpperCase() + categoria.slice(1);
  }

  /** Nombre limpio para el tile del picker. */
  nombreCorto(nombre: string): string {
    return nombre
      .replace(/^Carrito de /i, '')
      .replace(/^Estación de /i, '')
      .replace(/^Barra de /i, '')
      .replace(/^Dispensador de /i, '');
  }

  /** Toggle del chip de tipo de evento — re-tocarlo des-selecciona. */
  seleccionarTipo(tipo: TipoEvento): void {
    const actual = this.cotizacionForm.get('tipoEvento')?.value;
    const yaActivo = actual === tipo.name || actual === tipo.id;
    this.cotizacionForm.patchValue({ tipoEvento: yaActivo ? '' : tipo.name });
  }

  esTipoActivo(tipo: TipoEvento): boolean {
    const v = this.cotizacionForm.get('tipoEvento')?.value;
    return v === tipo.name || v === tipo.id;
  }

  /* ── Picker ── */
  abrirPicker(): void {
    this.pickerSearch = '';
    this.pickerOpen = true;
  }
  cerrarPicker(): void { this.pickerOpen = false; }

  cerrarConfirmacion(): void {
    if (this.cargando || this.guardandoBorrador) return;
    this.confirmOpen = false;
  }

  confirmarGeneracion(): void {
    if (this.cargando || this.guardandoBorrador) return;
    this.confirmOpen = false;
    if (this.confirmAccion === 'borrador') {
      this.ejecutarGuardarBorrador();
    } else {
      this.guardarYDescargarPdf();
    }
  }

  seleccionarProducto(producto: Producto): void {
    if (this.idsEnCarrito.includes(producto.id)) return;

    this.items.push(this.crearGrupoProducto(producto));
    this.cerrarPicker();
  }

  private crearGrupoProducto(producto: Producto): FormGroup {
    if (producto.categoria === 'ilimitado') {
      return this.fb.group({
        productoId:           [producto.id, Validators.required],
        cantidad:             [null],
        esIlimitado:          [true],
        precioUnitarioManual: [null],
        descripcionManual:    [null],
        esPersonalizado:      [false],
        nombreProducto:       [producto.nombre],
        precioUnitarioVista:  [producto.precioUnitario],
        subtotalItem:         [producto.precioUnitario],
      });
    }

    const escala = this.buscarEscala(producto.id, this.cantidadDefault);
    const subtotal = escala ? escala.precioTotal : this.cantidadDefault * producto.precioUnitario;
    const precioUnit = escala ? escala.precioTotal / this.cantidadDefault : producto.precioUnitario;

    return this.fb.group({
      productoId:           [producto.id, Validators.required],
      cantidad:             [this.cantidadDefault],
      esIlimitado:          [false],
      precioUnitarioManual: [precioUnit],
      descripcionManual:    [null],
      esPersonalizado:      [false],
      nombreProducto:       [producto.nombre],
      precioUnitarioVista:  [precioUnit],
      subtotalItem:         [subtotal],
    });
  }

  agregarItemPersonalizado(): void {
    this.items.push(this.fb.group({
      productoId:           [null],
      cantidad:             [1],
      esIlimitado:          [false],
      precioUnitarioManual: [0],
      descripcionManual:    [''],
      esPersonalizado:      [true],
      nombreProducto:       [''],
      precioUnitarioVista:  [0],
      subtotalItem:         [0],
    }));
  }

  eliminarItem(index: number): void {
    this.items.removeAt(index);
  }

  productoDeItem(index: number): Producto | undefined {
    const id = this.items.at(index).get('productoId')?.value;
    if (id == null) return undefined;
    return this.productos.find(p => p.id === +id);
  }

  /** Cuando cambia la cantidad: si hay escala usarla, si no, recalcula subtotal con precio actual. */
  onCantidadCambiada(index: number): void {
    const itemGroup = this.items.at(index) as FormGroup;
    const cantidad = itemGroup.get('cantidad')?.value;
    const productoId = itemGroup.get('productoId')?.value;

    if (!cantidad || cantidad <= 0) {
      itemGroup.patchValue({ subtotalItem: 0 });
      return;
    }

    if (productoId) {
      const escala = this.buscarEscala(+productoId, +cantidad);
      if (escala) {
        const precioCalculado = escala.precioTotal / cantidad;
        itemGroup.patchValue({
          subtotalItem: escala.precioTotal,
          precioUnitarioVista: precioCalculado,
          precioUnitarioManual: precioCalculado,
        });
        return;
      }
    }

    const precio = +itemGroup.get('precioUnitarioManual')?.value || 0;
    if (precio > 0) {
      itemGroup.patchValue({ subtotalItem: cantidad * precio });
    }
  }

  /** Subtotal editado → recalcular precio unitario. */
  onSubtotalCambiado(index: number): void {
    const itemGroup = this.items.at(index) as FormGroup;
    const cantidad = +itemGroup.get('cantidad')?.value || 0;
    const subtotal = +itemGroup.get('subtotalItem')?.value || 0;

    if (cantidad > 0 && subtotal >= 0) {
      const precioCalculado = subtotal / cantidad;
      itemGroup.patchValue({
        precioUnitarioVista: precioCalculado,
        precioUnitarioManual: precioCalculado,
      });
    }
  }

  /** Precio unitario editado → recalcular subtotal. */
  onPrecioManualCambiado(index: number): void {
    const itemGroup = this.items.at(index) as FormGroup;
    const cantidad = +itemGroup.get('cantidad')?.value || 0;
    const precio = +itemGroup.get('precioUnitarioManual')?.value || 0;

    if (cantidad > 0 && precio >= 0) {
      itemGroup.patchValue({
        precioUnitarioVista: precio,
        subtotalItem: cantidad * precio,
      });
    }
  }

  generarPdf(): void {
    if (!this.validarFormulario()) return;

    this.error = '';
    this.confirmAccion = 'pdf';
    this.confirmOpen = true;
  }

  /** Validación compartida entre "Generar cotización" y "Guardar borrador". */
  private validarFormulario(): boolean {
    if (this.cotizacionForm.invalid) {
      this.cotizacionForm.markAllAsTouched();
      this.error = 'Completa los campos obligatorios';
      return false;
    }

    if (this.items.length === 0) {
      this.error = 'Agrega al menos un producto al carrito';
      return false;
    }

    return true;
  }

  /** Valida y abre el diálogo de confirmación para guardar como borrador. */
  guardarBorrador(): void {
    if (this.cargando || this.guardandoBorrador) return;
    if (!this.validarFormulario()) return;

    this.error = '';
    this.confirmAccion = 'borrador';
    this.confirmOpen = true;
  }

  /**
   * Guarda la cotización sin descargar el PDF. El backend crea siempre en
   * estado BORRADOR; en modo edición el PUT conserva el estado actual.
   */
  private ejecutarGuardarBorrador(): void {
    this.guardandoBorrador = true;

    const formValue = this.cotizacionForm.value as CotizacionFormValue;
    const request = this.crearCotizacionRequest(formValue);

    const peticion$ = this.modoEdicion
      ? this.cotizacionService.actualizar(this.cotizacionId!, request)
      : this.cotizacionService.crear(request);

    peticion$.subscribe({
      next: (cotizacion) => {
        this.guardandoBorrador = false;
        this.router.navigate(['/historial', cotizacion.id]);
      },
      error: (err) => {
        this.error = 'Error al guardar el borrador. Verifica los datos e intenta de nuevo.';
        this.guardandoBorrador = false;
        console.error('Error:', err);
      }
    });
  }

  private guardarYDescargarPdf(): void {
    this.cargando = true;
    this.error = '';

    const formValue = this.cotizacionForm.value as CotizacionFormValue;
    const request = this.crearCotizacionRequest(formValue);

    const peticion$ = this.modoEdicion
      ? this.cotizacionService.actualizarYDescargarPdf(this.cotizacionId!, request)
      : this.cotizacionService.crearYDescargarPdf(request);

    peticion$.subscribe({
      next: (pdfBlob) => {
        const url = window.URL.createObjectURL(pdfBlob);
        const a = document.createElement('a');
        a.href = url;
        const itemsDesc = formValue.items
          .map(item => this.descripcionParaArchivo(item))
          .join(', ');
        // En modo invitado el archivo no debe llevar la marca real del negocio.
        const prefijo = this.auth.esInvitado() ? 'Cotizacion' : 'Cotizacion ABYLU';
        a.download = `${prefijo} - ${itemsDesc}.pdf`;
        a.click();
        window.URL.revokeObjectURL(url);
        this.cargando = false;

        if (this.modoEdicion) {
          this.router.navigate(['/historial', this.cotizacionId]);
        }
      },
      error: (err) => {
        this.error = this.modoEdicion
          ? 'Error al guardar los cambios. Verifica los datos e intenta de nuevo.'
          : 'Error al generar el PDF. Verifica los datos e intenta de nuevo.';
        this.cargando = false;
        console.error('Error:', err);
      }
    });
  }

  private crearCotizacionRequest(formValue: CotizacionFormValue): CrearCotizacionRequest {
    return {
      clienteTelefono: formValue.clienteTelefono,
      fechaEvento: formValue.fechaEvento,
      tipoEvento: formValue.tipoEvento || '',
      lugarEvento: formValue.lugarEvento,
      notas: formValue.notas || '',
      descuento: +formValue.descuento || 0,
      movilidad: +formValue.movilidad || 0,
      horasServicio: formValue.horasServicio?.toString() || '',
      items: formValue.items.map(item => this.crearItemRequest(item)),
    };
  }

  private descripcionParaArchivo(item: CotizacionFormItem): string {
    if (item.esPersonalizado) {
      return `${item.cantidad} ${item.descripcionManual || 'Personalizado'}`;
    }

    const nombre = item.nombreProducto || 'Producto';
    if (item.esIlimitado && nombre.toLowerCase() === 'dispensador de bebidas') {
      return `16 Lt. ${nombre}`;
    }

    return item.esIlimitado ? `Ilimitado ${nombre}` : `${item.cantidad} ${nombre}`;
  }

  private crearItemRequest(item: CotizacionFormItem): ItemCotizacionRequest {
    if (item.esPersonalizado) {
      return {
        productoId: null,
        cantidad: +item.cantidad!,
        esIlimitado: false,
        precioUnitarioManual: +item.precioUnitarioManual!,
        descripcionManual: item.descripcionManual,
      };
    }

    return {
      productoId: +item.productoId!,
      cantidad: item.esIlimitado ? null : +item.cantidad!,
      esIlimitado: item.esIlimitado,
      precioUnitarioManual: item.precioUnitarioManual != null ? +item.precioUnitarioManual : null,
      descripcionManual: null,
    };
  }
}
