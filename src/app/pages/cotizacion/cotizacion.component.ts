import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, FormArray, Validators } from '@angular/forms';
import { HeaderComponent } from '../../components/header/header.component';
import { ProductoService, CotizacionService } from '../../core/services';
import { Producto, ProductoPrecioEscala, CrearCotizacionRequest } from '../../shared/models';

interface TipoEvento {
  id: string;
  name: string;
  emoji: string;
}

@Component({
  selector: 'app-cotizacion',
  imports: [CommonModule, ReactiveFormsModule, HeaderComponent],
  templateUrl: './cotizacion.component.html',
  styleUrl: './cotizacion.component.css'
})
export class CotizacionComponent implements OnInit {

  private fb = inject(FormBuilder);
  private productoService = inject(ProductoService);
  private cotizacionService = inject(CotizacionService);

  productos: Producto[] = [];
  escalas: ProductoPrecioEscala[] = [];

  cargando = false;
  error = '';

  pickerOpen = false;
  pickerTab: string = 'Todos';

  readonly tiposEvento: TipoEvento[] = [
    { id: 'cumple',      name: 'Cumpleaños',  emoji: '🎂' },
    { id: 'boda',        name: 'Matrimonio',  emoji: '💍' },
    { id: 'corporativo', name: 'Corporativo', emoji: '🏢' },
    { id: 'baby',        name: 'Baby shower', emoji: '🍼' },
    { id: 'quince',      name: 'Quinceañero', emoji: '👑' },
    { id: 'otros',       name: 'Otros',       emoji: '✨' },
  ];

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

  /** Categorías que aparecen en las tabs del picker. */
  get categoriasPicker(): string[] {
    const cats = new Set<string>(this.productos.map(p => this.formatCategoria(p.categoria)));
    return ['Todos', ...Array.from(cats)];
  }

  get productosVisibles(): Producto[] {
    if (this.pickerTab === 'Todos') return this.productos;
    return this.productos.filter(p => this.formatCategoria(p.categoria) === this.pickerTab);
  }

  ngOnInit(): void {
    this.initForm();
    this.cargarProductos();
    this.cargarEscalas();
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
    this.pickerTab = 'Todos';
    this.pickerOpen = true;
  }
  cerrarPicker(): void { this.pickerOpen = false; }

  seleccionarProducto(producto: Producto): void {
    if (this.idsEnCarrito.includes(producto.id)) return;

    if (producto.categoria === 'ilimitado') {
      this.items.push(this.fb.group({
        productoId:           [producto.id, Validators.required],
        cantidad:             [null],
        esIlimitado:          [true],
        precioUnitarioManual: [null],
        descripcionManual:    [null],
        esPersonalizado:      [false],
        nombreProducto:       [producto.nombre],
        precioUnitarioVista:  [producto.precioUnitario],
        subtotalItem:         [producto.precioUnitario],
      }));
    } else {
      const cantidadDefault = 50;
      const escala = this.buscarEscala(producto.id, cantidadDefault);
      const subtotal = escala ? escala.precioTotal : cantidadDefault * producto.precioUnitario;
      const precioUnit = escala ? escala.precioTotal / cantidadDefault : producto.precioUnitario;

      this.items.push(this.fb.group({
        productoId:           [producto.id, Validators.required],
        cantidad:             [cantidadDefault],
        esIlimitado:          [false],
        precioUnitarioManual: [precioUnit],
        descripcionManual:    [null],
        esPersonalizado:      [false],
        nombreProducto:       [producto.nombre],
        precioUnitarioVista:  [precioUnit],
        subtotalItem:         [subtotal],
      }));
    }

    this.cerrarPicker();
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
    if (this.cotizacionForm.invalid) {
      this.cotizacionForm.markAllAsTouched();
      this.error = 'Completa los campos obligatorios';
      return;
    }

    if (this.items.length === 0) {
      this.error = 'Agrega al menos un producto al carrito';
      return;
    }

    this.cargando = true;
    this.error = '';

    const formValue = this.cotizacionForm.value;

    const request: CrearCotizacionRequest = {
      clienteTelefono: formValue.clienteTelefono,
      fechaEvento: formValue.fechaEvento,
      tipoEvento: formValue.tipoEvento || '',
      lugarEvento: formValue.lugarEvento,
      notas: formValue.notas || '',
      descuento: +formValue.descuento || 0,
      movilidad: +formValue.movilidad || 0,
      horasServicio: formValue.horasServicio?.toString() || '',
      items: formValue.items.map((item: any) => {
        if (item.esPersonalizado) {
          return {
            productoId: null,
            cantidad: +item.cantidad,
            esIlimitado: false,
            precioUnitarioManual: +item.precioUnitarioManual,
            descripcionManual: item.descripcionManual,
          };
        }
        return {
          productoId: +item.productoId,
          cantidad: item.esIlimitado ? null : +item.cantidad,
          esIlimitado: item.esIlimitado,
          precioUnitarioManual: item.precioUnitarioManual != null ? +item.precioUnitarioManual : null,
          descripcionManual: null,
        };
      }),
    };

    this.cotizacionService.crearYDescargarPdf(request).subscribe({
      next: (pdfBlob) => {
        const url = window.URL.createObjectURL(pdfBlob);
        const a = document.createElement('a');
        a.href = url;
        const itemsDesc = formValue.items
          .map((item: any) => {
            if (item.esPersonalizado) {
              return `${item.cantidad} ${item.descripcionManual || 'Personalizado'}`;
            }
            const nombre = item.nombreProducto || 'Producto';
            if (item.esIlimitado && nombre.toLowerCase() === 'dispensador de bebidas') {
              return `16 Lt. ${nombre}`;
            }
            return item.esIlimitado ? `Ilimitado ${nombre}` : `${item.cantidad} ${nombre}`;
          })
          .join(', ');
        a.download = `Cotizacion ABYLU - ${itemsDesc}.pdf`;
        a.click();
        window.URL.revokeObjectURL(url);
        this.cargando = false;
      },
      error: (err) => {
        this.error = 'Error al generar el PDF. Verifica los datos e intenta de nuevo.';
        this.cargando = false;
        console.error('Error:', err);
      }
    });
  }
}
